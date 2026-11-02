import { getAppCapabilities } from "@/lib/app-config";
import "server-only";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import { SupabaseRunSummaryRepository } from "@/lib/summaries/repository";
import { RunSummarySchema, type RunSummary, type SummaryInsightContext, type SummarySplitContext } from "@/lib/summaries/schema";
import { applyCreatorAggregation } from "@/lib/summaries/service";
import { batchValues } from "@/lib/supabase/batch";
import { synthesisCacheMetadata, type SynthesisCacheMetadata } from "@/lib/summaries/cache";
import { localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";

export type Briefing = { scopeType?: "RUN" | "DATE_RANGE"; freshness?: "unchanged" | "stale" | "unknown"; includedInsightCount?: number; distinctCreatorCount?: number; bounds?: SynthesisCacheMetadata["bounds"]; id: string; summary: RunSummary; generatedAt: string; from: string; to: string; model: string; promptVersion: string; pipelineVersion: string | null; sourceIds: string[]; episodeIds: string[]; insights: SummaryInsightContext[]; splits: SummarySplitContext[]; mode: string; excludedEpisodeCount: number };
export async function getBriefing(from: string, to: string, id?: string, timezoneOffsetMinutes = 0): Promise<Briefing | null> {
  localDateRangeToUtcBounds(from, to, timezoneOffsetMinutes);
  const db = createSupabaseServerClient();
  let query = db.from("run_summaries").select("id,summary_data,synthesis_attempts!inner(status)")
    .eq("scope_type", "DATE_RANGE").eq("from_date", from).eq("to_date", to).eq("synthesis_attempts.status", "COMPLETED");
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("generated_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Unable to load briefing: ${error.message}`);
  if (!data) return null;
  const bounds = (data.summary_data as { _synthesis?: SynthesisCacheMetadata })._synthesis?.bounds;
  if (!id && bounds) {
    const requested = localDateRangeToUtcBounds(from, to, timezoneOffsetMinutes);
    if (bounds.startInclusive !== requested.startInclusive || bounds.endExclusive !== requested.endExclusive) return null;
  }
  return getBriefingById(data.id as string);
}

export async function getBriefingById(id: string, checkFreshness = false): Promise<Briefing | null> {
  const db = createSupabaseServerClient();
  const { data, error } = await db.from("run_summaries")
    .select("id,scope_type,summary_data,generated_at,from_date,to_date,model,prompt_version,synthesis_mode,excluded_episodes,eligible_insight_count,distinct_creator_count,synthesis_episodes(episode_id),synthesis_attempts!inner(status)")
    .eq("id", id).eq("synthesis_attempts.status", "COMPLETED").maybeSingle();
  if (error) throw new Error(`Unable to load briefing: ${error.message}`);
  if (!data) return null;
  const summary = RunSummarySchema.parse(data.summary_data);
  const repository = new SupabaseRunSummaryRepository();
  const ids = [...new Set([...summary.overviewSupportingInsightIds, ...Object.values(summary.sections).flatMap((items) => items.flatMap((item) => item.supportingInsightIds))])];
  if (getAppCapabilities().mode === "public_read_only" && (ids.length > 200 || summary.splitDecisionIds.length > 20 || JSON.stringify(summary).length > 262144)) throw new Error("Public briefing exceeds evidence limit");
  // Only report citations and linked split evidence cross the browser boundary.
  const insights = await repository.loadInsightsForDisplay(ids);
  const splits = await repository.loadSplitsByIdsForDisplay(summary.splitDecisionIds);
  const splitInsights = await repository.loadInsightsForDisplay([...new Set(splits.flatMap((split) => split.positions.flatMap((position) => position.supportingInsightIds)))].filter((id) => !ids.includes(id)));
  const metadata = (data.summary_data as { _synthesis?: { identity?: { pipelineVersion?: string }; sourceIds?: string[] } })._synthesis;
  const episodeIds = (data.synthesis_episodes as { episode_id: string }[]).map((row) => row.episode_id);
  const sourceIds = new Set<string>(metadata?.sourceIds ?? []);
  if (!metadata?.sourceIds) for (const batch of batchValues(episodeIds)) {
    const episodes = await db.from("episodes").select("source_id").in("id", batch);
    if (episodes.error) throw new Error(`Unable to load briefing creators: ${episodes.error.message}`);
    for (const episode of episodes.data) sourceIds.add(episode.source_id as string);
  }
  const attention = Object.values(summary.sections).flatMap((items) => items.map((item) => item.attention));
  applyCreatorAggregation(summary, [...insights, ...splitInsights]);
  Object.values(summary.sections).flat().forEach((item, index) => { item.attention = attention[index]; });
  const cache = (data.summary_data as { _synthesis?: SynthesisCacheMetadata })._synthesis;
  let freshness: Briefing["freshness"] = "unknown";
  if (checkFreshness && data.scope_type === "DATE_RANGE" && cache?.fingerprint && cache.identity && cache.bounds) {
    try {
      const offset = (Date.parse(cache.bounds.startInclusive) - Date.parse(`${data.from_date}T00:00:00Z`)) / 60000;
      const context = await repository.loadDateRangeContext(data.from_date as string, data.to_date as string, offset);
      freshness = synthesisCacheMetadata(context, cache.identity, cache.bounds).fingerprint === cache.fingerprint ? "unchanged" : "stale";
    } catch { freshness = "unknown"; }
  }
  return { scopeType: data.scope_type as "RUN" | "DATE_RANGE", freshness, includedInsightCount: data.eligible_insight_count as number,
    distinctCreatorCount: data.distinct_creator_count as number, bounds: cache?.bounds ?? null, id: data.id as string, summary, generatedAt: data.generated_at as string, from: data.from_date as string ?? "", to: data.to_date as string ?? "",
    model: data.model as string, promptVersion: data.prompt_version as string, pipelineVersion: metadata?.identity?.pipelineVersion ?? null,
    sourceIds: [...sourceIds].sort(),
    episodeIds, insights: [...insights, ...splitInsights], splits, mode: data.synthesis_mode as string, excludedEpisodeCount: Array.isArray(data.excluded_episodes) ? data.excluded_episodes.length : 0 };
}
