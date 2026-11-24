import type { TraceEvent } from "./types.ts";

/** One line per event. Handy for logs, tests and the CLI. */
export function summarizeTrace(trace: TraceEvent[]): string {
  const t0 = trace[0]?.at ?? 0;
  return trace
    .map((e) => {
      const t = `+${String(e.at - t0).padStart(5)}ms`;
      switch (e.kind) {
        case "run_start":
          return `${t} start      ${clip(e.input)}`;
        case "model_call":
          return `${t} model#${e.step}   ${e.stopReason} (${e.usage.inputTokens} in / ${e.usage.outputTokens} out, ${e.ms}ms)${e.text ? " " + clip(e.text) : ""}`;
        case "tool_call":
          return `${t} call       ${e.name}(${clip(JSON.stringify(e.input))})`;
        case "tool_result":
          return `${t} ${e.isError ? "error " : "result"}     ${e.name} -> ${clip(e.output)}`;
        case "approval":
          return `${t} approval   ${e.name}: ${e.approved ? "approved" : "declined"}`;
        case "budget_stop":
          return `${t} STOP       ${e.reason}`;
        case "error":
          return `${t} ERROR      ${e.message}`;
        case "run_end":
          return `${t} end        ${e.status}`;
      }
    })
    .join("\n");
}

function clip(s: string, n = 90): string {
  const one = s.replace(/\s+/g, " ");
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}
