import type { JsonSchema, ToolSpec } from "./types.ts";

export interface ToolContext {
  /** Shared, per-run scratch space tools can read and write (e.g. a cart). */
  state: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface Tool<I = any> {
  name: string;
  description: string;
  input: JsonSchema & { type: "object" };
  /** If true, the harness asks the approve() hook before running it. */
  needsApproval?: boolean;
  /** Per-tool timeout in ms. Default 15s. */
  timeoutMs?: number;
  run(input: I, ctx: ToolContext): Promise<unknown> | unknown;
}

/** Identity helper that gives you type inference on `run`'s input. */
export function defineTool<I>(tool: Tool<I>): Tool<I> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) {
    throw new Error(`Tool name "${tool.name}" must be 1-64 chars of letters, digits, _ or -`);
  }
  return tool;
}

export function toSpec(tool: Tool): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { additionalProperties: false, ...tool.input },
  };
}

/** Tool output is sent back as text. Objects become pretty JSON. */
export function stringifyOutput(out: unknown): string {
  if (typeof out === "string") return out;
  if (out === undefined) return "ok";
  return JSON.stringify(out, null, 2);
}
