/** A read-only tool the assistant can call, in a form every model provider can be given. */
export interface AssistantTool {
  name: string;
  description: string;
  /** JSON Schema for the input: an object of string and integer properties. */
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string" | "integer"; description?: string; minimum?: number; maximum?: number }>;
    required?: string[];
    additionalProperties: false;
  };
  /** Runs the tool on an input already checked against the schema; answers JSON text. */
  run(input: Record<string, unknown>): Promise<string>;
}

/**
 * Checks a model's tool input against the tool's schema: required fields present, strings are
 * strings, integers are whole numbers within range, nothing else. Models, open ones especially,
 * sometimes send the wrong shape; the tool then gets an error to report instead of bad input.
 */
export function checkInput(tool: AssistantTool, raw: unknown): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Girdi bir nesne olmalı." };
  const given = raw as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(tool.inputSchema.properties)) {
    const value = given[key];
    if (value === undefined || value === null) continue;
    if (spec.type === "string") {
      if (typeof value !== "string") return { ok: false, error: `${key} metin olmalı.` };
      input[key] = value;
    } else {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `${key} tam sayı olmalı.` };
      if ((spec.minimum !== undefined && n < spec.minimum) || (spec.maximum !== undefined && n > spec.maximum)) {
        return { ok: false, error: `${key} ${spec.minimum ?? ""}–${spec.maximum ?? ""} aralığında olmalı.` };
      }
      input[key] = n;
    }
  }
  for (const key of tool.inputSchema.required ?? []) {
    if (input[key] === undefined) return { ok: false, error: `${key} gerekli.` };
  }
  return { ok: true, input };
}

/** Runs a tool call from any provider: checks the input, and turns every failure into data. */
export async function runTool(tools: AssistantTool[], name: string, raw: unknown): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return JSON.stringify({ error: `${name} diye bir araç yok.` });
  const checked = checkInput(tool, raw);
  if (!checked.ok) return JSON.stringify({ error: checked.error });
  return tool.run(checked.input);
}
