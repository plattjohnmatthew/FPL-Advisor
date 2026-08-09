import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RunSummaryGeneration } from "./generator";
import type { RunSummaryContext, SummaryInsightContext, SummarySplitContext, SynthesisScope } from "./schema";
import { batchValues } from "@/lib/supabase/batch";
import { localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";

type RunStatus = Exclude<RunSummaryContext["runStatus"], null>;

export function episodeIdsWithPersistedInsights(candidateIds: string[], insightEpisodeIds: string[]) {
  const withInsights = new Set(insightEpisodeIds);
  return candidateIds.filter((id) => withInsights.has(id));
}

export type SynthesisEligibilityCandidate = {
  id: string; title: string; sourceName: string; transcriptCount: number; insightCount: number;
};

export function evaluateSynthesisEligibility(candidates: SynthesisEligibilityCandidate[]) {
  const eligibleEpisodeIds: string[] = [];
  const excludedEpisodes: RunSummaryContext["excludedEpisodes"] = [];
  for (const episode of candidates) {
    const reasons: string[] = [];
    if (episode.transcriptCount === 0) reasons.push("No persisted transcript");
    if (episode.insightCount === 0) reasons.push("No successfully persisted insights");
    if (reasons.length === 0) eligibleEpisodeIds.push(episode.id);
    else excludedEpisodes.push({ episodeId: episode.id, title: episode.title, sourceName: episode.sourceName, reason: reasons.join("; ") });
  }
  return { eligibleEpisodeIds, excludedEpisodes };
}

export interface RunSummaryRepository {
  findLatestRelevantRun(): Promise<{ id: string; status: RunStatus } | null>;
  loadRunContext(runId: string, runStatus: RunStatus): Promise<RunSummaryContext>;
  loadDateRangeContext(fromDate: string, toDate: string, timezoneOffsetMinutes?: number): Promise<RunSummaryContext>;
  startAttempt(scope: SynthesisScope): Promise<string>;
  finishAttempt(attemptId: string, synthesisId: string): Promise<void>;
  failAttempt(attemptId: string, message: string): Promise<void>;
  persist(scope: SynthesisScope, context: RunSummaryContext, generation: RunSummaryGeneration): Promise<string>;
}

export class SupabaseRunSummaryRepository implements RunSummaryRepository {
  async findLatestRelevantRun() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("processing_runs").select("id, status")
      .in("status", ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Unable to find latest processing run for synthesis: ${error.message}`);
    return data ? { id: data.id as string, status: data.status as RunStatus } : null;
  }

  async loadRunContext(runId: string, runStatus: RunStatus) {
    const supabase = createSupabaseServerClient();
    const { data: attempts, error: attemptError } = await supabase.from("run_episodes")
      .select("episode_id, status, error_message").eq("run_id", runId);
    if (attemptError) throw new Error(`Unable to load run episodes for synthesis: ${attemptError.message}`);
    const episodeIds = attempts.map((row) => row.episode_id as string);
    const episodes: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(episodeIds)) {
      const { data, error } = await supabase.from("episodes").select("id, source_id, title, source_url, published_at").in("id", batch);
      if (error) throw new Error(`Unable to load synthesis episodes: ${error.message}`);
      episodes.push(...data);
    }
    const sourceIds = [...new Set(episodes.map((row) => row.source_id as string))];
    const { data: sources, error: sourceError } = sourceIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("sources").select("id, name").in("id", sourceIds);
    if (sourceError) throw new Error(`Unable to load synthesis sources: ${sourceError.message}`);
    const episodeById = new Map(episodes.map((row) => [row.id as string, row]));
    const sourceById = new Map(sources.map((row) => [row.id as string, row.name as string]));
    const successfulEpisodeIds = attempts.filter((row) => row.status === "COMPLETED").map((row) => row.episode_id as string);
    const failedEpisodes = attempts.filter((row) => row.status === "FAILED").map((row) => {
      const episode = episodeById.get(row.episode_id as string);
      return {
        episodeId: row.episode_id as string, title: episode?.title as string ?? "Unknown episode",
        sourceName: sourceById.get(episode?.source_id as string) ?? "Unknown source",
        errorMessage: row.error_message as string ?? "Unknown processing failure",
      };
    });

    const runInsights = await this.loadInsights(successfulEpisodeIds);
    const splitDecisions = await this.loadRelevantSplits(runInsights.map((item) => item.id));
    const historicalIds = [...new Set(splitDecisions.flatMap((decision) => decision.positions.flatMap((position) => position.supportingInsightIds)))]
      .filter((id) => !runInsights.some((insight) => insight.id === id));
    const historicalInsights = await this.loadInsightsByIds(historicalIds);

    return {
      scope: { type: "RUN" as const, runId }, runId, runStatus,
      eligibleEpisodeIds: successfulEpisodeIds, includedEpisodeIds: successfulEpisodeIds,
      excludedEpisodes: failedEpisodes.map((episode) => ({ ...episode, reason: episode.errorMessage })),
      excludedEpisodeCount: attempts.length - successfulEpisodeIds.length,
      distinctCreatorCount: new Set(successfulEpisodeIds.map((id) => episodeById.get(id)?.source_id as string).filter(Boolean)).size,
      failedEpisodes, insights: [...runInsights, ...historicalInsights], splitDecisions,
    };
  }

  async loadDateRangeContext(fromDate: string, toDate: string, timezoneOffsetMinutes = 0) {
    const supabase = createSupabaseServerClient();
    const bounds = localDateRangeToUtcBounds(fromDate, toDate, timezoneOffsetMinutes);
    const { data: episodes, error: episodeError } = await supabase.from("episodes").select("id, title, source_id, transcripts(id), insights(id)")
      .gte("published_at", bounds.startInclusive).lt("published_at", bounds.endExclusive);
    if (episodeError) throw new Error(`Unable to load date-range episodes: ${episodeError.message}`);
    const sourceIds = [...new Set(episodes.map((row) => row.source_id as string))];
    const { data: sources, error: sourceError } = sourceIds.length === 0 ? { data: [], error: null }
      : await supabase.from("sources").select("id, name").in("id", sourceIds);
    if (sourceError) throw new Error(`Unable to load date-range sources: ${sourceError.message}`);
    const sourceById = new Map(sources.map((source) => [source.id as string, source.name as string]));
    const eligibility = evaluateSynthesisEligibility(episodes.map((episode) => ({
      id: episode.id as string, title: episode.title as string,
      sourceName: sourceById.get(episode.source_id as string) ?? "Unknown source",
      transcriptCount: (episode.transcripts as Array<{ id: string }>).length,
      insightCount: (episode.insights as Array<{ id: string }>).length,
    })));
    const includedEpisodeIds = eligibility.eligibleEpisodeIds;
    const runInsights = await this.loadInsights(includedEpisodeIds);
    const splitDecisions = await this.loadRelevantSplits(runInsights.map((item) => item.id));
    const historicalIds = [...new Set(splitDecisions.flatMap((decision) => decision.positions.flatMap((position) => position.supportingInsightIds)))]
      .filter((id) => !runInsights.some((insight) => insight.id === id));
    const historicalInsights = await this.loadInsightsByIds(historicalIds);
    return {
      scope: { type: "DATE_RANGE" as const, fromDate, toDate }, runId: null, runStatus: null,
      eligibleEpisodeIds: includedEpisodeIds, includedEpisodeIds,
      excludedEpisodes: eligibility.excludedEpisodes, excludedEpisodeCount: eligibility.excludedEpisodes.length,
      distinctCreatorCount: new Set(episodes.filter((episode) => includedEpisodeIds.includes(episode.id as string)).map((episode) => episode.source_id as string)).size,
      failedEpisodes: [], insights: [...runInsights, ...historicalInsights], splitDecisions,
    };
  }

  async loadInsightsForDisplay(insightIds: string[]) {
    return this.loadInsightsByIds(insightIds);
  }

  private async loadInsights(episodeIds: string[]) {
    if (episodeIds.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const rows: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(episodeIds)) {
      const { data, error } = await supabase.from("insights")
        .select("id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon").in("episode_id", batch);
      if (error) throw new Error(`Unable to load successful-run insights: ${error.message}`);
      rows.push(...data);
    }
    return this.hydrateInsights(rows);
  }

  private async loadInsightsByIds(insightIds: string[]) {
    if (insightIds.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const rows: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(insightIds)) {
      const { data, error } = await supabase.from("insights")
        .select("id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon").in("id", batch);
      if (error) throw new Error(`Unable to load split-support insights: ${error.message}`);
      rows.push(...data);
    }
    return this.hydrateInsights(rows);
  }

  private async hydrateInsights(rows: Array<Record<string, unknown>>): Promise<SummaryInsightContext[]> {
    if (rows.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const episodeIds = [...new Set(rows.map((row) => row.episode_id as string))];
    const episodes: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(episodeIds)) {
      const { data, error } = await supabase.from("episodes").select("id, source_id, title, source_url, published_at").in("id", batch);
      if (error) throw new Error(`Unable to hydrate insight episodes: ${error.message}`);
      episodes.push(...data);
    }
    const sourceIds = [...new Set(episodes.map((row) => row.source_id as string))];
    const { data: sources, error: sourceError } = await supabase.from("sources").select("id, name").in("id", sourceIds);
    if (sourceError) throw new Error(`Unable to hydrate insight sources: ${sourceError.message}`);
    const episodeById = new Map(episodes.map((row) => [row.id as string, row]));
    const sourceById = new Map(sources.map((row) => [row.id as string, row.name as string]));
    const insightIds = rows.map((row) => row.id as string);
    const entityLinks: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(insightIds)) {
      const { data, error } = await supabase.from("insight_entities").select("insight_id, role, entities(type, canonical_name)").in("insight_id", batch);
      if (error) throw new Error(`Unable to hydrate insight entities: ${error.message}`);
      entityLinks.push(...data);
    }
    return rows.map((row) => {
      const episode = episodeById.get(row.episode_id as string)!;
      return {
        id: row.id as string, sourceId: episode.source_id as string,
        sourceName: sourceById.get(episode.source_id as string) ?? "Unknown source",
        episodeId: episode.id as string, episodeTitle: episode.title as string, sourceUrl: episode.source_url as string,
        publishedAt: episode.published_at as string,
        claim: row.claim as string, reasoning: row.reasoning as string, primaryCategory: row.primary_category as string,
        recommendation: row.recommendation as string, timeHorizon: row.time_horizon as string,
        entities: entityLinks.filter((link) => link.insight_id === row.id).map((link) => {
          const entity = link.entities as unknown as { type: "PLAYER" | "TEAM"; canonical_name: string };
          return { type: entity.type, name: entity.canonical_name, role: link.role as string };
        }),
      };
    });
  }

  private async loadRelevantSplits(runInsightIds: string[]): Promise<SummarySplitContext[]> {
    if (runInsightIds.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const matchingLinks: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(runInsightIds)) {
      const { data, error } = await supabase.from("split_position_insights").select("split_position_id").in("insight_id", batch);
      if (error) throw new Error(`Unable to find run split decisions: ${error.message}`);
      matchingLinks.push(...data);
    }
    const positionIds = [...new Set(matchingLinks.map((row) => row.split_position_id as string))];
    if (positionIds.length === 0) return [];
    const matchingPositions: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(positionIds)) {
      const { data, error } = await supabase.from("split_positions").select("split_decision_id").in("id", batch);
      if (error) throw new Error(`Unable to find relevant split IDs: ${error.message}`);
      matchingPositions.push(...data);
    }
    const decisionIds = [...new Set(matchingPositions.map((row) => row.split_decision_id as string))];
    const decisions: Array<Record<string, unknown>> = [];
    const positions: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(decisionIds)) {
      const [{ data: decisionData, error: decisionError }, { data: positionData, error: positionError }] = await Promise.all([
        supabase.from("split_decisions").select("id, question, unresolved_question, implication").in("id", batch),
        supabase.from("split_positions").select("id, split_decision_id, position, reasoning").in("split_decision_id", batch),
      ]);
      if (decisionError) throw new Error(`Unable to load relevant split decisions: ${decisionError.message}`);
      if (positionError) throw new Error(`Unable to load split positions: ${positionError.message}`);
      decisions.push(...decisionData); positions.push(...positionData);
    }
    const allPositionIds = positions.map((row) => row.id as string);
    const links: Array<Record<string, unknown>> = [];
    for (const batch of batchValues(allPositionIds)) {
      const { data, error } = await supabase.from("split_position_insights").select("split_position_id, insight_id").in("split_position_id", batch);
      if (error) throw new Error(`Unable to load split evidence: ${error.message}`);
      links.push(...data);
    }
    const evidenceIds = [...new Set(links.map((row) => row.insight_id as string))];
    const evidence = await this.loadInsightsByIds(evidenceIds);
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    return decisions.map((decision) => ({
      id: decision.id as string, question: decision.question as string,
      unresolvedQuestion: decision.unresolved_question as string | null, implication: decision.implication as string | null,
      positions: positions.filter((position) => position.split_decision_id === decision.id).map((position) => {
        const supportingInsightIds = links.filter((link) => link.split_position_id === position.id).map((link) => link.insight_id as string);
        return {
          position: position.position as string, reasoning: position.reasoning as string, supportingInsightIds,
          creators: [...new Set(supportingInsightIds.map((id) => evidenceById.get(id)?.sourceName).filter((name): name is string => Boolean(name)))],
        };
      }),
    }));
  }

  async startAttempt(scope: SynthesisScope) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("synthesis_attempts").insert({
      scope_type: scope.type, run_id: scope.type === "RUN" ? scope.runId : null,
      from_date: scope.type === "DATE_RANGE" ? scope.fromDate : null,
      to_date: scope.type === "DATE_RANGE" ? scope.toDate : null, status: "RUNNING",
    }).select("id").single();
    if (error) throw new Error(`Unable to start synthesis attempt: ${error.message}`);
    return data.id as string;
  }

  async finishAttempt(attemptId: string, synthesisId: string) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("synthesis_attempts").update({
      status: "COMPLETED", completed_at: new Date().toISOString(), synthesis_id: synthesisId, error_message: null,
    }).eq("id", attemptId);
    if (error) throw new Error(`Unable to complete synthesis attempt: ${error.message}`);
  }

  async failAttempt(attemptId: string, message: string) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("synthesis_attempts").update({
      status: "FAILED", completed_at: new Date().toISOString(), error_message: message,
    }).eq("id", attemptId);
    if (error) throw new Error(`Unable to record synthesis failure: ${error.message}`);
  }

  async persist(scope: SynthesisScope, context: RunSummaryContext, generation: RunSummaryGeneration) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("persist_scoped_synthesis", {
      target_scope_type: scope.type, target_run_id: scope.type === "RUN" ? scope.runId : null,
      target_from_date: scope.type === "DATE_RANGE" ? scope.fromDate : null,
      target_to_date: scope.type === "DATE_RANGE" ? scope.toDate : null,
      target_episode_ids: context.includedEpisodeIds,
      target_eligible_episode_count: context.eligibleEpisodeIds.length,
      target_excluded_episodes: context.excludedEpisodes,
      target_distinct_creator_count: context.distinctCreatorCount,
      target_summary_text: generation.summary.overviewParagraphs.join("\n\n"),
      target_summary_data: generation.summary, target_generated_at: generation.generatedAt,
      target_prompt_version: generation.promptVersion, target_model: generation.model,
      target_input_tokens: generation.inputTokens, target_output_tokens: generation.outputTokens,
      target_total_tokens: generation.totalTokens,
    });
    if (error) throw new Error(`Unable to persist synthesis: ${error.message}`);
    return data as string;
  }
}
