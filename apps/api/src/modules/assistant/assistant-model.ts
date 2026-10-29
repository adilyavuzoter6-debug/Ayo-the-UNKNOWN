import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

/** Answers one question with the tools it's given; the conversation so far ends with the question. */
export interface AssistantModel {
  answer(input: { system: string[]; messages: AssistantTurn[]; tools: BetaRunnableTool[] }): Promise<string>;
}

export const ASSISTANT_MODEL = Symbol("ASSISTANT_MODEL");

const MODEL = "claude-opus-5-5";
/** API round trips per question: enough to look up several farms and batches, bounded for cost. */
const MAX_ITERATIONS = 8;

/**
 * Claude through the Anthropic SDK's tool runner, which calls the tools and loops until Claude has
 * an answer. A refused request falls back server-side to another model (fallbacks "default").
 */
@Injectable()
export class ClaudeAssistantModel implements AssistantModel {
  private readonly logger = new Logger(ClaudeAssistantModel.name);
  private client: Anthropic | undefined;

  private anthropic(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException("Yapay zeka asistanı henüz yapılandırılmadı.");
    }
    this.client ??= new Anthropic();
    return this.client;
  }

  async answer({ system, messages, tools }: { system: string[]; messages: AssistantTurn[]; tools: BetaRunnableTool[] }) {
    try {
      const final = await this.anthropic().beta.messages
        .toolRunner({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          // Caches the growing prefix, so each round trip of one question re-reads it cheaply.
          cache_control: { type: "ephemeral" },
          system: system.map((text) => ({ type: "text" as const, text })),
          messages,
          tools,
          max_iterations: MAX_ITERATIONS,
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
      if (!text) {
        return "Bu soru için çok fazla veriye bakmam gerekti ve yanıtı tamamlayamadım. Soruyu daha dar sormayı deneyin (örneğin tek bir çiftlik ya da parti).";
      }
      return text;
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
