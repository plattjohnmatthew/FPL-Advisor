import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OpenAIUsageTask } from "./model-policy";
import { estimateOpenAICostUsd, type OpenAITokenUsage } from "./pricing";

type ResponseWithUsage = { usage?: { input_tokens: number; output_tokens: number; total_tokens: number; input_tokens_details?: { cached_tokens?: number } | null } | null };
export type OpenAICallContext = { task: OpenAIUsageTask; model: string; requestId?: string; episodeId?: string | null; processingRunId?: string | null };

export function normalizeResponseUsage(response: ResponseWithUsage): OpenAITokenUsage | null {
  if (!response.usage) return null;
  return { inputTokens: response.usage.input_tokens, cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0, outputTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens };
}

async function persistUsage(context: OpenAICallContext, status: "COMPLETED" | "FAILED", startedAt: string, completedAt: string, usage: OpenAITokenUsage | null) {
  const estimatedCostUsd = usage ? estimateOpenAICostUsd(context.model, usage) : null;
  const event = { event: "openai_usage", task: context.task, model: context.model, status, requestId: context.requestId ?? null, episodeId: context.episodeId ?? null, processingRunId: context.processingRunId ?? null, ...usage, estimatedCostUsd, timestamp: completedAt };
  console.info(JSON.stringify(event));
  try {
    const { error } = await createSupabaseServerClient().from("ai_usage_events").insert({
      task_type: context.task, model: context.model, status, request_id: context.requestId ?? null,
      episode_id: context.episodeId ?? null, processing_run_id: context.processingRunId ?? null,
      input_tokens: usage?.inputTokens ?? null, cached_input_tokens: usage?.cachedInputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null, total_tokens: usage?.totalTokens ?? null,
      estimated_cost_usd: estimatedCostUsd, started_at: startedAt, completed_at: completedAt,
    });
    if (error) console.error(JSON.stringify({ event: "openai_usage_persistence_failed", task: context.task, model: context.model, status, timestamp: completedAt }));
  } catch {
    console.error(JSON.stringify({ event: "openai_usage_persistence_failed", task: context.task, model: context.model, status, timestamp: completedAt }));
  }
}

export async function trackOpenAICall<T extends ResponseWithUsage>(context: OpenAICallContext, operation: () => Promise<T>): Promise<T> {
  const startedAt = new Date().toISOString();
  try {
    const response = await operation();
    await persistUsage(context, "COMPLETED", startedAt, new Date().toISOString(), normalizeResponseUsage(response));
    return response;
  } catch (error) {
    await persistUsage(context, "FAILED", startedAt, new Date().toISOString(), null);
    throw error;
  }
}
