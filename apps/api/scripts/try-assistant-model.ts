/**
 * Asks the configured model one question with two made-up tools, to check a provider before
 * production is pointed at it: that it calls the tools, reads their results and answers in Turkish.
 * Uses the same ASSISTANT_* variables as the API (see OpenAICompatibleAssistantModel); touches no
 * database and starts no server.
 *
 *   node --env-file=.env -r ts-node/register/transpile-only scripts/try-assistant-model.ts
 *
 * The token counts it logs show what one question costs against the provider's free allowance.
 */
import "reflect-metadata";
import { OpenAICompatibleAssistantModel } from "../src/modules/assistant/assistant-model";
import type { AssistantTool } from "../src/modules/assistant/assistant-tool";

const calls: string[] = [];

const tools: AssistantTool[] = [
  {
    name: "list_farms",
    description: "Şirketin çiftliklerini listeler: id ve ad.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      calls.push("list_farms");
      return JSON.stringify([
        { id: "f1", name: "Merkez" },
        { id: "f2", name: "Göl Kafesleri" },
      ]);
    },
  },
  {
    name: "farm_kpis",
    description: "Bir çiftliğin son N gündeki göstergeleri: canlı balık sayısı, biyokütle (kg), FCR, ölüm oranı (%).",
    inputSchema: {
      type: "object",
      properties: {
        farmId: { type: "string", description: "list_farms'tan gelen çiftlik id'si" },
        days: { type: "integer", minimum: 7, maximum: 90, description: "Kaç günlük dönem (varsayılan 30)" },
      },
      required: ["farmId"],
      additionalProperties: false,
    },
    run: async (input) => {
      calls.push(`farm_kpis ${JSON.stringify(input)}`);
      return JSON.stringify(
        input.farmId === "f1"
          ? { liveFish: 131614, biomassKg: 41250, fcr: 1.18, mortalityPct: 0.9 }
          : { liveFish: 58200, biomassKg: 22900, fcr: 1.46, mortalityPct: 2.7 },
      );
    },
  },
];

async function main() {
  const answer = await new OpenAICompatibleAssistantModel().answer({
    system: [
      "Bir alabalık çiftliği yönetim uygulamasının asistanısın. Yalnızca araçlardan gelen verilere dayanarak, kısa ve Türkçe yanıt ver.",
    ],
    messages: [{ role: "user", content: "Hangi çiftliğimin FCR'si daha kötü ve ölüm oranı ne?" }],
    tools,
  });
  console.log(`\nTool calls: ${calls.length ? calls.join(", ") : "none"}`);
  console.log(`\nAnswer:\n${answer}\n`);
  if (!calls.some((c) => c.startsWith("farm_kpis"))) {
    console.error("The model answered without looking up the farms: tool calling isn't working with this provider/model.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
