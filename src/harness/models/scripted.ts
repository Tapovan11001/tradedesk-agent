import type { ContentBlock, ModelClient, ModelRequest, ModelTurn } from "../types.ts";

/**
 * A step in a scripted conversation. Either a fixed turn, or a function that
 * looks at the conversation so far (e.g. the last tool result) and decides.
 */
export type ScriptStep = ScriptTurn | ((req: ModelRequest) => ScriptTurn);

export interface ScriptTurn {
  text?: string;
  tools?: { name: string; input: unknown }[];
  stopReason?: string;
}

/**
 * A fake model that plays back a script. Used for:
 *  - unit tests (deterministic, free, offline)
 *  - the "demo" mode of the web apps, so anyone can see a run without an API key
 *
 * It is NOT a model. Demo runs say so in the UI.
 */
export function scriptedModel(steps: ScriptStep[], opts: { delayMs?: number } = {}): ModelClient {
  let i = 0;
  let idCounter = 0;
  return {
    name: "scripted-replay",
    async complete(req) {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const step = steps[Math.min(i, steps.length - 1)];
      i++;
      const turn = typeof step === "function" ? step(req) : step;
      const content: ContentBlock[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text, citations: null } as ContentBlock);
      for (const t of turn.tools ?? []) {
        content.push({ type: "tool_use", id: `toolu_${++idCounter}`, name: t.name, input: t.input } as ContentBlock);
      }
      const inputTokens = Math.round(JSON.stringify(req.messages).length / 4);
      const outputTokens = Math.round(JSON.stringify(content).length / 4);
      return {
        content,
        stopReason: turn.stopReason ?? (turn.tools?.length ? "tool_use" : "end_turn"),
        usage: { inputTokens, outputTokens },
        model: "scripted-replay",
      } satisfies ModelTurn;
    },
  };
}

/** Helper for function steps: the text of the most recent tool result(s). */
export function lastToolResults(req: ModelRequest): string[] {
  const last = req.messages[req.messages.length - 1];
  if (!last || typeof last.content === "string") return [];
  return (last.content ?? [])
    .filter((b: any) => b.type === "tool_result")
    .map((b: any) => (typeof b.content === "string" ? b.content : JSON.stringify(b.content)));
}
