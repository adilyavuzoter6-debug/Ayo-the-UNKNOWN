import type { AssistantModel } from "../../src/modules/assistant/assistant-model";

/**
 * Stands in for Claude in integration tests. "tools?" answers with the names of the tools it was
 * given; "tool:<name> <json input>" runs that tool and answers with its output. That is enough to
 * check what the assistant can see without calling a model.
 */
export class FakeAssistantModel implements AssistantModel {
  async answer({ messages, tools }: Parameters<AssistantModel["answer"]>[0]) {
    const question = messages.at(-1)!.content.trim();
    if (question === "tools?") return tools.map((t) => ("name" in t ? t.name : "")).join(",");
    const match = /^tool:(\S+)\s*(.*)$/s.exec(question);
    if (!match) return "ok";
    const tool = tools.find((t) => "name" in t && t.name === match[1]);
    if (!tool || !("run" in tool)) return `no tool ${match[1]}`;
    const result = await tool.run(match[2] ? JSON.parse(match[2]) : {});
    return typeof result === "string" ? result : JSON.stringify(result);
  }
}
