import { ServiceUnavailableException } from "@nestjs/common";
import { OpenAICompatibleAssistantModel } from "./assistant-model";
import { checkInput, type AssistantTool } from "./assistant-tool";

const farms: AssistantTool = {
  name: "farm_kpis",
  description: "KPIs",
  inputSchema: {
    type: "object",
    properties: { farmId: { type: "string" }, days: { type: "integer", minimum: 7, maximum: 90 } },
    required: ["farmId"],
    additionalProperties: false,
  },
  run: async (input) => JSON.stringify({ seen: input }),
};

function reply(message: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message }] }), { status, headers: { "Content-Type": "application/json" } });
}

describe("checkInput", () => {
  it("keeps declared fields, coerces numeric strings, and refuses missing or wrong ones", () => {
    expect(checkInput(farms, { farmId: "f1", days: "30", extra: 1 })).toEqual({ ok: true, input: { farmId: "f1", days: 30 } });
    expect(checkInput(farms, { days: 30 })).toEqual({ ok: false, error: "farmId gerekli." });
    expect(checkInput(farms, { farmId: 5 })).toMatchObject({ ok: false });
    expect(checkInput(farms, { farmId: "f1", days: 400 })).toMatchObject({ ok: false });
    expect(checkInput(farms, "nope")).toMatchObject({ ok: false });
  });
});

describe("OpenAICompatibleAssistantModel", () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.ASSISTANT_BASE_URL = "https://llm.example/v1/";
    process.env.ASSISTANT_API_KEY = "test-key";
    process.env.ASSISTANT_MODEL = "gpt-oss-120b";
    delete process.env.ASSISTANT_REASONING_EFFORT;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("runs the model's tool calls, sends back the results, and returns the final answer", async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "farm_kpis", arguments: '{"farmId":"f1"}' } }],
        }),
      )
      .mockResolvedValueOnce(reply({ content: "<think>plan</think>Merkez'de **131.614** balık var." }));

    const answer = await new OpenAICompatibleAssistantModel().answer({
      system: ["talimat", "bağlam"],
      messages: [{ role: "user", content: "Kaç balık var?" }],
      tools: [farms],
    });
    expect(answer).toBe("Merkez'de **131.614** balık var.");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const first = JSON.parse(init.body as string);
    expect(first).toMatchObject({ model: "gpt-oss-120b", tool_choice: "auto", reasoning_effort: "low", max_tokens: 4096 });
    expect(first.messages[0]).toEqual({ role: "system", content: "talimat\n\nbağlam" });
    expect(first.tools[0].function.name).toBe("farm_kpis");

    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"seen":{"farmId":"f1"}}' });
  });

  it("answers a bad tool input as an error the model can read", async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ content: "", tool_calls: [{ id: "c", type: "function", function: { name: "farm_kpis", arguments: "{oops" } }] }),
      )
      .mockResolvedValueOnce(reply({ content: "Bir sorun oldu." }));
    await new OpenAICompatibleAssistantModel().answer({ system: ["s"], messages: [{ role: "user", content: "q" }], tools: [farms] });
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1).content).toContain("geçerli JSON değil");
  });

  it("accepts tool arguments sent as an object rather than a JSON string", async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ content: "", tool_calls: [{ id: "c", type: "function", function: { name: "farm_kpis", arguments: { farmId: "f2" } } }] }),
      )
      .mockResolvedValueOnce(reply({ content: "Tamam." }));
    await new OpenAICompatibleAssistantModel().answer({ system: ["s"], messages: [{ role: "user", content: "q" }], tools: [farms] });
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1).content).toBe('{"seen":{"farmId":"f2"}}');
  });

  it("explains a full quota and a missing key or address", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(
      new OpenAICompatibleAssistantModel().answer({ system: ["s"], messages: [{ role: "user", content: "q" }], tools: [] }),
    ).rejects.toThrow("kotası");

    delete process.env.ASSISTANT_API_KEY;
    await expect(
      new OpenAICompatibleAssistantModel().answer({ system: ["s"], messages: [{ role: "user", content: "q" }], tools: [] }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    process.env.ASSISTANT_API_KEY = "test-key";
    delete process.env.ASSISTANT_BASE_URL;
    await expect(
      new OpenAICompatibleAssistantModel().answer({ system: ["s"], messages: [{ role: "user", content: "q" }], tools: [] }),
    ).rejects.toThrow("yapılandırılmadı");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
