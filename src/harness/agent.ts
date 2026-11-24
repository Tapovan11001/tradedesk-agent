import { validate } from "./schema.ts";
import { stringifyOutput, toSpec, type Tool, type ToolContext } from "./tool.ts";
import type {
  MessageParam,
  ModelClient,
  RunResult,
  RunStatus,
  ToolUseBlock,
  TraceEvent,
  Usage,
} from "./types.ts";

export interface Limits {
  /** Max model calls in one run. Default 12. */
  maxSteps: number;
  /** Max tool executions in one run. Default 30. */
  maxToolCalls: number;
  /** Max input+output tokens summed over the run. Default 400k. */
  maxTokens: number;
  /** Same tool with the same input this many times = the model is looping. Default 3. */
  maxRepeats: number;
}

export interface AgentOptions {
  model: ModelClient;
  system: string;
  tools?: Tool[];
  limits?: Partial<Limits>;
  /** Called for every trace event as it happens (for live UIs and logs). */
  onEvent?: (event: TraceEvent) => void;
  /** Gate for tools marked needsApproval. Return false to decline. */
  approve?: (call: { name: string; input: unknown }) => boolean | Promise<boolean>;
  /** Initial shared state handed to tools. */
  state?: Record<string, unknown>;
}

const DEFAULT_LIMITS: Limits = { maxSteps: 12, maxToolCalls: 30, maxTokens: 400_000, maxRepeats: 3 };

/**
 * The whole harness is this loop:
 *
 *   ask the model -> if it wants tools, validate + run them -> send results back -> repeat
 *
 * with budgets checked before every step, every action written to the trace,
 * and tool failures turned into error results the model can recover from
 * instead of exceptions that kill the run.
 */
export class Agent {
  readonly opts: AgentOptions;
  readonly limits: Limits;
  private tools: Map<string, Tool>;

  constructor(opts: AgentOptions) {
    this.opts = opts;
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this.tools = new Map((opts.tools ?? []).map((t) => [t.name, t]));
  }

  async run(input: string, signal?: AbortSignal): Promise<RunResult> {
    const trace: TraceEvent[] = [];
    const emit = (e: TraceEvent) => {
      trace.push(e);
      this.opts.onEvent?.(e);
    };
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const messages: MessageParam[] = [{ role: "user", content: input }];
    const ctx: ToolContext = { state: this.opts.state ?? {}, signal };
    const specs = [...this.tools.values()].map(toSpec);
    const seen = new Map<string, number>();

    let steps = 0;
    let toolCalls = 0;
    let output = "";

    const finish = (status: RunStatus): RunResult => {
      emit({ kind: "run_end", at: Date.now(), status, output });
      return { status, output, trace, usage, steps, toolCalls, messages };
    };

    emit({ kind: "run_start", at: Date.now(), input });

    while (true) {
      if (signal?.aborted) return finish("aborted");

      const over = this.overBudget(steps, toolCalls, usage);
      if (over) {
        emit({ kind: "budget_stop", at: Date.now(), step: steps, reason: over });
        return finish("budget_exceeded");
      }

      steps++;
      const started = Date.now();
      let turn;
      try {
        turn = await this.opts.model.complete({ system: this.opts.system, messages, tools: specs, signal });
      } catch (err) {
        emit({ kind: "error", at: Date.now(), step: steps, message: errorMessage(err) });
        return finish(signal?.aborted ? "aborted" : "error");
      }
      usage.inputTokens += turn.usage.inputTokens;
      usage.outputTokens += turn.usage.outputTokens;

      const text = turn.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) output = text;
      emit({ kind: "model_call", at: Date.now(), step: steps, ms: Date.now() - started, stopReason: turn.stopReason, usage: turn.usage, text });

      // Append the assistant turn exactly as returned (thinking blocks included);
      // the API expects history to be replayed unchanged.
      messages.push({ role: "assistant", content: turn.content as Extract<MessageParam["content"], unknown[]> });

      if (turn.stopReason === "refusal") return finish("refused");
      if (turn.stopReason === "pause_turn") continue;

      const calls = turn.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      if (calls.length === 0) {
        if (turn.stopReason === "max_tokens") {
          emit({ kind: "error", at: Date.now(), step: steps, message: "Model hit max_tokens before finishing." });
          return finish("error");
        }
        return finish("done");
      }

      // Run every requested tool (concurrently) and answer them all in ONE user message.
      const results = await Promise.all(
        calls.map(async (call) => {
          toolCalls++;
          emit({ kind: "tool_call", at: Date.now(), step: steps, id: call.id, name: call.name, input: call.input });
          const t0 = Date.now();
          const { content, isError } = await this.execute(call, ctx, seen, steps, emit);
          emit({ kind: "tool_result", at: Date.now(), step: steps, id: call.id, name: call.name, ms: Date.now() - t0, output: content, isError });
          return { type: "tool_result" as const, tool_use_id: call.id, content, is_error: isError || undefined };
        }),
      );
      messages.push({ role: "user", content: results });
    }
  }

  private overBudget(steps: number, toolCalls: number, usage: Usage): string | null {
    const l = this.limits;
    if (steps >= l.maxSteps) return `step limit reached (${l.maxSteps} model calls)`;
    if (toolCalls >= l.maxToolCalls) return `tool call limit reached (${l.maxToolCalls})`;
    const total = usage.inputTokens + usage.outputTokens;
    if (total >= l.maxTokens) return `token budget spent (${total} of ${l.maxTokens})`;
    return null;
  }

  private async execute(
    call: ToolUseBlock,
    ctx: ToolContext,
    seen: Map<string, number>,
    step: number,
    emit: (e: TraceEvent) => void,
  ): Promise<{ content: string; isError: boolean }> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { content: `Unknown tool "${call.name}". Available: ${[...this.tools.keys()].join(", ")}`, isError: true };
    }

    const problems = validate(call.input, tool.input);
    if (problems.length) {
      return { content: `Invalid input:\n- ${problems.join("\n- ")}`, isError: true };
    }

    const key = call.name + ":" + stableJson(call.input);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > this.limits.maxRepeats) {
      return {
        content: `You have already called ${call.name} with this exact input ${count - 1} times. Use the earlier result or try a different approach.`,
        isError: true,
      };
    }

    if (tool.needsApproval) {
      const approved = this.opts.approve ? await this.opts.approve({ name: call.name, input: call.input }) : false;
      emit({ kind: "approval", at: Date.now(), step, id: call.id, name: call.name, approved });
      if (!approved) return { content: "The user declined this action. Do not retry it; continue without it.", isError: true };
    }

    try {
      const out = await withTimeout(Promise.resolve(tool.run(call.input, ctx)), tool.timeoutMs ?? 15_000, call.name);
      return { content: stringifyOutput(out), isError: false };
    } catch (err) {
      return { content: `Tool failed: ${errorMessage(err)}`, isError: true };
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** JSON with sorted keys, so {a,b} and {b,a} count as the same call. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableJson((v as any)[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
