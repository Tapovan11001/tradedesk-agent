import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient, ModelRequest, ModelTurn } from "../types.ts";

export interface AnthropicModelOptions {
  /** Defaults to ANTHROPIC_API_KEY in Node. In the browser, pass the user's own key. */
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  /** Set true only for bring-your-own-key browser demos. The key never leaves the user's browser except to api.anthropic.com. */
  browser?: boolean;
}

/** ModelClient backed by the Claude Messages API. */
export function anthropicModel(opts: AnthropicModelOptions = {}): ModelClient {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: opts.browser ?? false,
  });
  const model = opts.model ?? "claude-opus-5-5";

  return {
    name: model,
    async complete(req: ModelRequest): Promise<ModelTurn> {
      const res = await client.beta.messages.create(
        {
          model,
          max_tokens: opts.maxTokens ?? 16000,
          system: req.system,
          messages: req.messages,
          // ToolSpec is a strict subset of the SDK tool shape.
          tools: req.tools as Anthropic.Beta.BetaTool[],
          output_config: { effort: opts.effort ?? "medium" },
          // Cache the stable prefix (tools + system + earlier turns) between steps.
          cache_control: { type: "ephemeral" },
          // If the model declines for policy reasons, let the API retry on its default fallback.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: req.signal },
      );
      return {
        content: res.content,
        stopReason: res.stop_reason,
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
        model: res.model,
      };
    },
  };
}
