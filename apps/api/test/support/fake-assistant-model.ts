import type { AssistantModel } from "../../src/modules/assistant/assistant-model";
import { runTool } from "../../src/modules/assistant/assistant-tool";

/**
 * Stands in for Claude in integration tests. "tools?" answers with the names of the tools it was
 * given; "tool:<name> <json input>" runs that tool and answers with its output. That is enough to
 * check what the assistant can see without calling a model.
 */
export class FakeAssistantModel implements AssistantModel {
  async answer({ messages, tools }: Parameters<AssistantModel["answer"]>[0]) {
    const question = messages.at(-1)!.content.trim();
    if (question === "tools?") return tools.map((t) => t.name).join(",");
    const match = /^tool:(\S+)\s*(.*)$/s.exec(question);
    if (!match) return "ok";
    return runTool(tools, match[1]!, match[2] ? JSON.parse(match[2]) : {});
  }
}
