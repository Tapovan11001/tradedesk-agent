// Shared types. Message and content shapes are the Anthropic Messages API
// shapes, imported as types only, so the core has no runtime dependency on
// any SDK. A ModelClient adapter is the only place that talks to a provider.
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

export type ContentBlock = BetaContentBlock;
export type MessageParam = BetaMessageParam;
export type ToolUseBlock = BetaToolUseBlock;

/** A JSON Schema subset: enough to describe and validate tool inputs. */
export interface JsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
}

/** What a tool definition looks like on the wire. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: JsonSchema & { type: "object" };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** One model response, normalised. */
export interface ModelTurn {
  content: ContentBlock[];
  stopReason: string | null;
  usage: Usage;
  model?: string;
}

export interface ModelRequest {
  system: string;
  messages: MessageParam[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

/** Anything that can answer a ModelRequest: a real API, or a scripted replay. */
export interface ModelClient {
  readonly name: string;
  complete(req: ModelRequest): Promise<ModelTurn>;
}

/** Everything the harness records while it runs. The trace is the product. */
export type TraceEvent =
  | { kind: "run_start"; at: number; input: string }
  | { kind: "model_call"; at: number; step: number; ms: number; stopReason: string | null; usage: Usage; text: string }
  | { kind: "tool_call"; at: number; step: number; id: string; name: string; input: unknown }
  | { kind: "tool_result"; at: number; step: number; id: string; name: string; ms: number; output: string; isError: boolean }
  | { kind: "approval"; at: number; step: number; id: string; name: string; approved: boolean }
  | { kind: "budget_stop"; at: number; step: number; reason: string }
  | { kind: "error"; at: number; step: number; message: string }
  | { kind: "run_end"; at: number; status: RunStatus; output: string };

export type RunStatus = "done" | "budget_exceeded" | "refused" | "error" | "aborted";

export interface RunResult {
  status: RunStatus;
  /** Final assistant text. */
  output: string;
  trace: TraceEvent[];
  usage: Usage;
  steps: number;
  toolCalls: number;
  messages: MessageParam[];
}
