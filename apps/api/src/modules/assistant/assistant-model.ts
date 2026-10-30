import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { runTool, type AssistantTool } from "./assistant-tool";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

/** Answers one question with the tools it's given; the conversation so far ends with the question. */
export interface AssistantModel {
  answer(input: { system: string[]; messages: AssistantTurn[]; tools: AssistantTool[] }): Promise<string>;
}

export const ASSISTANT_MODEL = Symbol("ASSISTANT_MODEL");

/** Model round trips per question: enough to look up several farms and batches, bounded for cost and quota. */
const MAX_ROUND_TRIPS = 6;
const UNCONFIGURED = "Yapay zeka asistanı henüz yapılandırılmadı.";
/**
 * Output that isn't an answer, which gpt-oss on Workers AI occasionally produces instead of one: a
 * character over and over ("!!!!…"), or its own message format leaking out (<|end|><|start|>…)
 * when it loses track of it mid tool call.
 */
const BROKEN = /([^\s\-=_.*])\1{39,}|<\|(?:start|end|channel|message|call|return|constrain)\|>/;
const TOO_BROAD =
  "Bu soru için çok fazla veriye bakmam gerekti ve yanıtı tamamlayamadım. Soruyu daha dar sormayı deneyin (örneğin tek bir çiftlik ya da parti).";

/**
 * Any model behind an OpenAI-compatible chat completions API. Configured by environment:
 *
 *   ASSISTANT_BASE_URL          the provider's API root, for example
 *     Cloudflare Workers AI (free daily allowance): https://api.cloudflare.com/client/v4/accounts/<account id>/ai/v1
 *     Groq (model openai/gpt-oss-120b):             https://api.groq.com/openai/v1
 *     Ollama on the same machine (no key):          http://localhost:11434/v1
 *   ASSISTANT_API_KEY           the provider's key or API token (not needed for a local server)
 *   ASSISTANT_MODEL             default @cf/openai/gpt-oss-120b: OpenAI's open-weight model (Apache 2.0) on Workers AI
 *   ASSISTANT_REASONING_EFFORT  low | medium | high; defaults to low for gpt-oss models
 */
@Injectable()
export class OpenAICompatibleAssistantModel implements AssistantModel {
  private readonly logger = new Logger(OpenAICompatibleAssistantModel.name);
  private readonly baseUrl = (process.env.ASSISTANT_BASE_URL ?? "").replace(/\/+$/, "");
  private readonly apiKey = process.env.ASSISTANT_API_KEY;
  private readonly model = process.env.ASSISTANT_MODEL ?? "@cf/openai/gpt-oss-120b";
  private readonly reasoningEffort =
    process.env.ASSISTANT_REASONING_EFFORT ?? (this.model.includes("gpt-oss") ? "low" : undefined);

  async answer({ system, messages, tools }: { system: string[]; messages: AssistantTurn[]; tools: AssistantTool[] }) {
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(this.baseUrl);
    if (!this.baseUrl || (!this.apiKey && !local)) throw new ServiceUnavailableException(UNCONFIGURED);

    const conversation: Record<string, unknown>[] = [
      { role: "system", content: system.join("\n\n") },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const functions = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));

    const spent = { prompt: 0, completion: 0, neurons: 0 };
    const called: string[] = [];
    let retried = false;
    for (let trip = 0; trip < MAX_ROUND_TRIPS; trip++) {
      const { message, usage } = await this.complete(conversation, functions);
      spent.prompt += usage?.prompt_tokens ?? 0;
      spent.completion += usage?.completion_tokens ?? 0;
      spent.neurons += usage?.neurons ?? 0;
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) {
        // Some open models put their reasoning in <think> tags in the answer itself.
        const text = (message.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (BROKEN.test(text)) {
          this.logger.warn(`Model returned a broken answer (${text.length} chars)${retried ? "" : "; asking again"}.`);
          if (retried) return "Bu soruya şu an düzgün bir yanıt oluşturamadım. Lütfen tekrar sorun.";
          retried = true;
          continue;
        }
        // Logged so the provider's free allowance can be judged against real questions (Workers AI
        // reports what a call cost in neurons, its unit for the daily allowance).
        this.logger.log(
          `Answered in ${trip + 1} round trips, ${spent.prompt} prompt + ${spent.completion} completion tokens` +
            (spent.neurons > 0 ? `, ${Math.round(spent.neurons)} neurons.` : "."),
        );
        return text || TOO_BROAD;
      }
      // The model's reasoning goes back with its tool calls: gpt-oss is built to read its own plan
      // when it continues after a tool result, until it gives the final answer. Sent under the name
      // the provider used for it.
      const reasoning = message.reasoning_content
        ? { reasoning_content: message.reasoning_content }
        : message.reasoning
          ? { reasoning: message.reasoning }
          : {};
      conversation.push({ role: "assistant", content: message.content ?? "", tool_calls: calls, ...reasoning });
      for (const call of calls) {
        called.push(call.function.name);
        // Arguments are a JSON string in the OpenAI format; some compatible servers send the object.
        let args: unknown = call.function.arguments;
        try {
          if (typeof args === "string") args = JSON.parse(args || "{}");
        } catch {
          args = undefined;
        }
        const result =
          args === undefined
            ? JSON.stringify({ error: "Araç girdisi geçerli JSON değil." })
            : await runTool(tools, call.function.name, args);
        conversation.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    this.logger.warn(
      `Gave up after ${MAX_ROUND_TRIPS} round trips (tools: ${called.join(", ")}), ${Math.round(spent.neurons)} neurons.`,
    );
    return TOO_BROAD;
  }

  private async complete(conversation: Record<string, unknown>[], functions: unknown[]) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: conversation,
          tools: functions,
          tool_choice: "auto",
          // max_tokens rather than max_completion_tokens: every compatible server reads it, and Workers AI
          // would otherwise cap the reply at its default of 256 tokens. A long answer takes about 800;
          // the cap also bounds what a degenerate answer wastes before it's retried.
          max_tokens: 2048,
          ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      this.logger.error(`Assistant model unreachable: ${error}`);
      throw new ServiceUnavailableException("Asistanın yapay zeka servisine ulaşılamadı. Lütfen tekrar deneyin.");
    }
    if (res.status === 429) {
      // A per-minute limit or a used-up daily allowance; the provider's answer doesn't always say which.
      throw new ServiceUnavailableException("Asistanın kullanım kotası şu an dolu. Lütfen daha sonra tekrar deneyin.");
    }
    if (res.status === 401 || res.status === 403) {
      this.logger.error(`Assistant model rejected the API key (${res.status}).`);
      throw new ServiceUnavailableException(UNCONFIGURED);
    }
    if (!res.ok) {
      this.logger.error(`Assistant model error ${res.status}: ${(await res.text()).slice(0, 500)}`);
      throw new ServiceUnavailableException("Asistan şu anda yanıt veremiyor. Lütfen tekrar deneyin.");
    }
    const body = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          reasoning?: string | null;
          tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string | object } }[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number };
    };
    return { message: body.choices?.[0]?.message ?? {}, usage: body.usage };
  }
}

/**
 * Claude through the Anthropic SDK's tool runner (ASSISTANT_PROVIDER=anthropic, ANTHROPIC_API_KEY).
 * A refused request falls back server-side to another model (fallbacks "default").
 */
@Injectable()
export class ClaudeAssistantModel implements AssistantModel {
  private readonly logger = new Logger(ClaudeAssistantModel.name);
  private client: Anthropic | undefined;

  async answer({ system, messages, tools }: { system: string[]; messages: AssistantTurn[]; tools: AssistantTool[] }) {
    if (!process.env.ANTHROPIC_API_KEY) throw new ServiceUnavailableException(UNCONFIGURED);
    this.client ??= new Anthropic();
    try {
      const final = await this.client.beta.messages
        .toolRunner({
          model: process.env.ASSISTANT_MODEL ?? "claude-opus-5-5",
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          // Caches the growing prefix, so each round trip of one question re-reads it cheaply.
          cache_control: { type: "ephemeral" },
          system: system.map((text) => ({ type: "text" as const, text })),
          messages,
          tools: tools.map((t) =>
            betaTool({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              run: (args: unknown) => runTool(tools, t.name, args),
            }),
          ),
          max_iterations: MAX_ROUND_TRIPS,
        })
        .runUntilDone();

      if (final.stop_reason === "refusal") {
        return "Bu soruya yanıt veremiyorum. Sorunuzu çiftlik verileriniz üzerinden yeniden sorabilirsiniz.";
      }
      const text = final.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return text || TOO_BROAD;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException("Asistan şu anda yoğun. Birkaç saniye sonra tekrar deneyin.");
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Claude API error ${error.status}: ${error.message}`);
        throw new ServiceUnavailableException("Asistan şu anda yanıt veremiyor. Lütfen tekrar deneyin.");
      }
      throw error;
    }
  }
}

/** Picks the model provider from ASSISTANT_PROVIDER: open-weight models by default, or Claude. */
export function assistantModelFromEnv(): AssistantModel {
  return process.env.ASSISTANT_PROVIDER === "anthropic" ? new ClaudeAssistantModel() : new OpenAICompatibleAssistantModel();
}
