import type { Agent } from "./agent.ts";
import type { RunResult } from "./types.ts";

export interface EvalCase {
  name: string;
  /** Optional key so makeAgent can pick per-case setup. */
  id?: string;
  input: string;
  /** Return true to pass, or a string explaining the failure. */
  check: (result: RunResult) => true | string | Promise<true | string>;
}

export interface EvalOutcome {
  name: string;
  passed: boolean;
  reason?: string;
  status: RunResult["status"];
  steps: number;
  toolCalls: number;
  tokens: number;
  ms: number;
}

export interface EvalReport {
  passed: number;
  total: number;
  outcomes: EvalOutcome[];
}

/**
 * Run each case on a fresh agent and grade it with code. Fresh agent per case
 * so state from one case cannot leak into the next.
 */
export async function runEvals(cases: EvalCase[], makeAgent: (c: EvalCase) => Agent): Promise<EvalReport> {
  const outcomes: EvalOutcome[] = [];
  for (const c of cases) {
    const t0 = Date.now();
    const result = await makeAgent(c).run(c.input);
    let verdict: true | string;
    try {
      verdict = await c.check(result);
    } catch (err) {
      verdict = `check threw: ${err instanceof Error ? err.message : String(err)}`;
    }
    outcomes.push({
      name: c.name,
      passed: verdict === true,
      reason: verdict === true ? undefined : verdict,
      status: result.status,
      steps: result.steps,
      toolCalls: result.toolCalls,
      tokens: result.usage.inputTokens + result.usage.outputTokens,
      ms: Date.now() - t0,
    });
  }
  return { passed: outcomes.filter((o) => o.passed).length, total: outcomes.length, outcomes };
}

export function formatReport(r: EvalReport): string {
  const lines = r.outcomes.map(
    (o) =>
      `${o.passed ? "PASS" : "FAIL"}  ${o.name.padEnd(36)} ${o.status.padEnd(15)} steps=${o.steps} tools=${o.toolCalls} tokens=${o.tokens}` +
      (o.reason ? `\n      -> ${o.reason}` : ""),
  );
  return [...lines, "", `${r.passed}/${r.total} passed`].join("\n");
}
