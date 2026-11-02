import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RunAlreadyInProgressError } from "./repository";
import type { EpisodeTransition, ProcessingRepository } from "./repository";
import type {
  DiscoveredEpisode,
  EpisodeAttemptHistory,
  ProcessingRunResult,
  ProcessingFailure,
  ProcessingSource,
  RunTotals,
  SourceCheckpoint,
  StoredEpisode,
} from "./types";
import type { NormalizedTranscriptResult } from "@/lib/transcripts/provider";
import { batchValues } from "@/lib/supabase/batch";
import { validateExtractionForPersistence } from "@/lib/insights/schema";
import type { ProcessingRunOptions } from "./options";
import type { NormalizedUrlItem } from "./youtube-url-batch";
import { loadFplRegistry } from "@/lib/fpl/repository";
import { resolveExtractionEntities } from "@/lib/fpl/matching";
import { resolveCanonicalEntitiesForPersistence } from "@/lib/fpl/extraction-entity-resolution";
import type { TranscriptProviderCallRecord } from "@/lib/transcripts/audited-provider";
import { isAutomaticEpisodeRetryEligible } from "./failure-classification";

type EpisodeRow = {
  id: string;
  source_id: string;
  external_episode_id: string;
  title: string;
  source_url: string;
  published_at: string;
  duration_seconds: number | null;
  gameweek: number | null;
};

function mapEpisode(row: EpisodeRow): StoredEpisode {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalEpisodeId: row.external_episode_id,
    title: row.title,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds,
    gameweek: row.gameweek,
  };
}

export class SupabaseProcessingRepository implements ProcessingRepository {
  async recordTranscriptProviderCall(record: TranscriptProviderCallRecord) {
    const { error } = await createSupabaseServerClient().from("transcript_provider_calls").insert({
      provider: record.provider, episode_id: record.episodeId, external_episode_id: record.externalEpisodeId, source_id: record.sourceId,
      processing_run_id: record.processingRunId, trigger: record.trigger, transcript_existed_before_call: record.transcriptExistedBeforeCall,
      success: record.success, provider_response_status: record.responseStatus, ai_fallback_allowed: record.aiFallbackAllowed,
      ai_fallback_used: record.aiFallbackUsed, duration_ms: record.durationMs, retry_attempt_count: record.retryAttemptCount,
      http_request_count: record.httpRequestCount, billable_request_count: record.billableRequestCount,
      error_kind: record.errorKind, error_message: record.errorMessage, started_at: record.startedAt, completed_at: record.completedAt,
      provider_role: record.providerRole, fallback_reason: record.fallbackReason, fallback_provider: record.fallbackProvider,
      error_code: record.errorCode, fallback_eligible: record.fallbackEligible,
    });
    if (error) throw new Error(`Unable to audit transcript-provider request: ${error.message}`);
  }
  async markTranscriptProviderFallbackUsed(record: { provider: string; episodeId: string; processingRunId: string | null; fallbackProvider: string; fallbackReason: string }) {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("transcript_provider_calls").select("id").eq("provider", record.provider).eq("episode_id", record.episodeId).eq("provider_role", "PRIMARY").order("started_at", { ascending: false }).limit(1);
    query = record.processingRunId ? query.eq("processing_run_id", record.processingRunId) : query.is("processing_run_id", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Unable to locate transcript-provider fallback audit: ${error.message}`);
    if (!data) return;
    const { error: updateError } = await supabase.from("transcript_provider_calls").update({
      fallback_subsequently_used: true, fallback_provider: record.fallbackProvider, fallback_reason: record.fallbackReason,
    }).eq("id", data.id);
    if (updateError) throw new Error(`Unable to update transcript-provider fallback audit: ${updateError.message}`);
  }
  async requestCancellation(runId: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("processing_runs")
      .update({ status: "CANCELLING", cancellation_requested_at: new Date().toISOString() })
      .eq("id", runId).eq("status", "RUNNING").select("id").maybeSingle();
    if (error) throw new Error(`Unable to request run cancellation: ${error.message}`);
    return Boolean(data);
  }

  async isCancellationRequested(runId: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("processing_runs").select("status").eq("id", runId).single();
    if (error) throw new Error(`Unable to check run cancellation: ${error.message}`);
    return data.status === "CANCELLING" || data.status === "CANCELLED";
  }

  async recordFailure(failure: ProcessingFailure) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("processing_failures").insert({
      run_id: failure.runId,
      episode_id: failure.episodeId,
      stage: failure.stage,
      error_message: failure.errorMessage,
      retryable: failure.retryable,
      occurred_at: failure.occurredAt,
    });
    if (error) throw new Error(`Unable to persist processing failure: ${error.message}`);
  }

  async createRun(options: ProcessingRunOptions, selectedSourceIds?: string[]) {
    const supabase = createSupabaseServerClient();
    if (selectedSourceIds) {
      const { data, error } = await supabase.rpc("create_processing_run_with_sources", {
        target_source_ids: selectedSourceIds,
        target_discovery_start: options.discoveryStart,
        target_discovery_end: options.discoveryEnd,
        target_youtube_max_videos_per_creator: options.constraints.youtube.maxVideosPerCreator,
      });
      if (error?.code === "23505") throw new RunAlreadyInProgressError();
      if (error) throw new Error(`Unable to create processing run: ${error.message}`);
      return data as string;
    }
    const { data, error } = await supabase
      .from("processing_runs")
      .insert({
        status: "RUNNING",
        discovery_start: options.discoveryStart,
        discovery_end: options.discoveryEnd,
        youtube_max_videos_per_creator: options.constraints.youtube.maxVideosPerCreator,
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      throw new RunAlreadyInProgressError();
    }
    if (error) {
      throw new Error(`Unable to create processing run: ${error.message}`);
    }
    return data.id as string;
  }

  async listRunSources(runId: string): Promise<ProcessingSource[]> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("processing_run_sources")
      .select("sources!inner(id, name, platform, channel_url, external_channel_id, enabled)")
      .eq("processing_run_id", runId).eq("sources.enabled", true).order("created_at");
    if (error) throw new Error(`Unable to load run source snapshot: ${error.message}`);
    return data.map((row) => {
      const source = row.sources as unknown as Record<string, unknown>;
      return { id: source.id as string, name: source.name as string, platform: source.platform as ProcessingSource["platform"], channelUrl: source.channel_url as string, externalChannelId: source.external_channel_id as string };
    });
  }

  async listEnabledSources(): Promise<ProcessingSource[]> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("sources")
      .select("id, name, platform, channel_url, external_channel_id")
      .eq("enabled", true)
      .order("created_at");

    if (error) {
      throw new Error(`Unable to load enabled sources: ${error.message}`);
    }

    return data.map((source) => ({
      id: source.id as string,
      name: source.name as string,
      platform: source.platform as ProcessingSource["platform"],
      channelUrl: source.channel_url as string,
      externalChannelId: source.external_channel_id as string,
    }));
  }

  async getCheckpoint(sourceId: string): Promise<SourceCheckpoint | null> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("source_checkpoints")
      .select("source_id, last_successful_published_at, last_successful_episode_external_id, last_checked_at")
      .eq("source_id", sourceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load source checkpoint: ${error.message}`);
    }
    if (!data) {
      return null;
    }

    return {
      sourceId: data.source_id as string,
      lastSuccessfulPublishedAt: data.last_successful_published_at as string | null,
      lastSuccessfulEpisodeExternalId: data.last_successful_episode_external_id as string | null,
      lastCheckedAt: data.last_checked_at as string | null,
    };
  }

  async listRetryableEpisodes(sourceId: string) {
    const supabase = createSupabaseServerClient();
    const { data: episodes, error: episodeError } = await supabase
      .from("episodes")
      .select("id, source_id, external_episode_id, title, source_url, published_at, duration_seconds, gameweek")
      .eq("source_id", sourceId).is("processing_paused_at", null);

    if (episodeError) {
      throw new Error(`Unable to load retry candidates: ${episodeError.message}`);
    }
    if (episodes.length === 0) {
      return [];
    }

    const rows = episodes as EpisodeRow[];
    const attempts: Array<{ episode_id: string; status: string; retry_count: number }> = [];
    const failures: Array<{ episode_id: string; stage: string; retryable: boolean; occurred_at: string }> = [];
    for (const batch of batchValues(rows.map((episode) => episode.id))) {
      const [{ data, error }, { data: failureData, error: failureError }] = await Promise.all([
        supabase.from("run_episodes").select("episode_id, status, retry_count").in("episode_id", batch),
        supabase.from("processing_failures").select("episode_id, stage, retryable, occurred_at").in("episode_id", batch).order("occurred_at", { ascending: false }),
      ]);
      if (error) throw new Error(`Unable to load previous episode attempts: ${error.message}`);
      if (failureError) throw new Error(`Unable to load previous transcript failures: ${failureError.message}`);
      attempts.push(...data as typeof attempts); failures.push(...failureData as typeof failures);
    }

    return rows.flatMap((episode) => {
      const history = attempts.filter((attempt) => attempt.episode_id === episode.id);
      if (history.length === 0 || history.some((attempt) => attempt.status === "COMPLETED")) {
        return [];
      }
      const latestFailure = failures.filter((failure) => failure.episode_id === episode.id)
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0];
      if (!isAutomaticEpisodeRetryEligible(latestFailure)) return [];

      const retryCount = Math.max(...history.map((attempt) => Number(attempt.retry_count))) + 1;
      return [{ ...mapEpisode(episode), retryCount }];
    });
  }

  async upsertEpisode(sourceId: string, episode: DiscoveredEpisode) {
    const supabase = createSupabaseServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("episodes")
      .select("id")
      .eq("source_id", sourceId)
      .eq("external_episode_id", episode.externalEpisodeId)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Unable to check episode identity: ${existingError.message}`);
    }

    const { data, error } = await supabase
      .from("episodes")
      .upsert(
        {
          source_id: sourceId,
          external_episode_id: episode.externalEpisodeId,
          title: episode.title,
          source_url: episode.sourceUrl,
          published_at: episode.publishedAt,
          duration_seconds: episode.durationSeconds,
          gameweek: episode.gameweek,
        },
        { onConflict: "source_id,external_episode_id" },
      )
      .select("id, source_id, external_episode_id, title, source_url, published_at, duration_seconds, gameweek")
      .single();

    if (error) {
      throw new Error(`Unable to upsert episode: ${error.message}`);
    }
    return { episode: mapEpisode(data as EpisodeRow), created: existing === null };
  }

  async getEpisodeAttemptHistory(episodeId: string): Promise<EpisodeAttemptHistory> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("run_episodes")
      .select("status, retry_count")
      .eq("episode_id", episodeId);

    if (error) {
      throw new Error(`Unable to load episode processing history: ${error.message}`);
    }

    return {
      completed: data.some((attempt) => attempt.status === "COMPLETED"),
      nextRetryCount: data.length === 0
        ? 0
        : Math.max(...data.map((attempt) => Number(attempt.retry_count))) + 1,
    };
  }

  async hasPersistedExtraction(episodeId: string) {
    const supabase = createSupabaseServerClient();
    const [extraction, insights] = await Promise.all([
      supabase.from("episode_extractions").select("id", { count: "exact", head: true }).eq("episode_id", episodeId),
      supabase.from("insights").select("id", { count: "exact", head: true }).eq("episode_id", episodeId),
    ]);
    if (extraction.error || insights.error) throw new Error(`Unable to check stored extraction: ${extraction.error?.message ?? insights.error?.message}`);
    return (extraction.count ?? 0) > 0 && (insights.count ?? 0) > 0;
  }

  async findEpisodeByExternalId(externalEpisodeId: string) {
    const { data, error } = await createSupabaseServerClient().from("episodes")
      .select("id, source_id, external_episode_id, title, source_url, published_at, duration_seconds, gameweek")
      .eq("external_episode_id", externalEpisodeId).limit(1).maybeSingle();
    if (error) throw new Error(`Unable to check existing video: ${error.message}`);
    return data ? mapEpisode(data as EpisodeRow) : null;
  }

  async getEpisode(episodeId: string) {
    const { data, error } = await createSupabaseServerClient().from("episodes")
      .select("id, source_id, external_episode_id, title, source_url, published_at, duration_seconds, gameweek")
      .eq("id", episodeId).maybeSingle();
    if (error) throw new Error(`Unable to load episode: ${error.message}`);
    return data ? mapEpisode(data as EpisodeRow) : null;
  }

  async createManualEpisodeRun(episode: StoredEpisode) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("processing_runs").insert({ status: "RUNNING", run_type: "MANUAL_EPISODE", episodes_discovered: 0, episodes_selected: 1 }).select("id").single();
    if (error?.code === "23505") throw new RunAlreadyInProgressError();
    if (error) throw new Error(`Unable to create manual episode run: ${error.message}`);
    const runId = data.id as string;
    const { error: sourceError } = await supabase.from("processing_run_sources").insert({ processing_run_id: runId, source_id: episode.sourceId });
    if (sourceError) throw new Error(`Unable to snapshot manual episode source: ${sourceError.message}`);
    return runId;
  }

  async setEpisodePaused(episodeId: string, paused: boolean) {
    const { error } = await createSupabaseServerClient().from("episodes").update({ processing_paused_at: paused ? new Date().toISOString() : null }).eq("id", episodeId);
    if (error) throw new Error(`Unable to ${paused ? "pause" : "resume"} episode: ${error.message}`);
  }

  async isEpisodePaused(episodeId: string) {
    const { data, error } = await createSupabaseServerClient().from("episodes").select("processing_paused_at").eq("id", episodeId).single();
    if (error) throw new Error(`Unable to read episode pause state: ${error.message}`);
    return data.processing_paused_at != null;
  }

  async isEpisodeFullyProcessed(episodeId: string) {
    const supabase = createSupabaseServerClient();
    const [transcript, extraction, insight] = await Promise.all([
      supabase.from("transcripts").select("id", { count: "exact", head: true }).eq("episode_id", episodeId),
      supabase.from("episode_extractions").select("id", { count: "exact", head: true }).eq("episode_id", episodeId),
      supabase.from("insights").select("id", { count: "exact", head: true }).eq("episode_id", episodeId),
    ]);
    const error = transcript.error ?? extraction.error ?? insight.error;
    if (error) throw new Error(`Unable to determine video processing state: ${error.message}`);
    return [transcript, extraction, insight].every((result) => (result.count ?? 0) > 0);
  }

  async createSpecificUrlBatchRun(items: NormalizedUrlItem[]) {
    const supabase = createSupabaseServerClient();
    const eligible = items.filter((item) => item.status === "VALID").length;
    const duplicates = items.filter((item) => item.status === "DUPLICATE_IN_BATCH").length;
    const invalid = items.filter((item) => item.status === "INVALID_URL" || item.status === "UNSUPPORTED_URL").length;
    const { data, error } = await supabase.from("processing_runs").insert({
      status: "RUNNING", run_type: "SPECIFIC_URL_BATCH", batch_submitted_count: items.length,
      batch_eligible_count: eligible, batch_duplicate_count: duplicates, batch_invalid_count: invalid,
    }).select("id").single();
    if (error?.code === "23505") throw new RunAlreadyInProgressError();
    if (error) throw new Error(`Unable to create URL batch run: ${error.message}`);
    const runId = data.id as string;
    const { error: itemError } = await supabase.from("processing_run_url_items").insert(items.map((item) => ({
      run_id: runId, line_number: item.lineNumber, submitted_url: item.submittedUrl,
      normalized_url: item.normalizedUrl, video_id: item.videoId, status: item.status, error_message: item.errorMessage,
    })));
    if (itemError) throw new Error(`Unable to store URL batch items: ${itemError.message}`);
    return runId;
  }

  async linkRunSource(runId: string, sourceId: string) {
    const { error } = await createSupabaseServerClient().from("processing_run_sources")
      .upsert({ processing_run_id: runId, source_id: sourceId }, { onConflict: "processing_run_id,source_id", ignoreDuplicates: true });
    if (error) throw new Error(`Unable to link batch creator: ${error.message}`);
  }

  async updateUrlBatchItem(runId: string, videoId: string, values: { status: string; episodeId?: string; errorMessage?: string | null }) {
    const update: Record<string, unknown> = { status: values.status, updated_at: new Date().toISOString() };
    if (values.episodeId !== undefined) update.episode_id = values.episodeId;
    if (values.errorMessage !== undefined) update.error_message = values.errorMessage;
    const { error } = await createSupabaseServerClient().from("processing_run_url_items").update(update)
      .eq("run_id", runId).eq("video_id", videoId).neq("status", "DUPLICATE_IN_BATCH");
    if (error) throw new Error(`Unable to update URL batch item: ${error.message}`);
  }

  async updateUrlBatchAlreadyProcessedCount(runId: string, count: number) {
    const { error } = await createSupabaseServerClient().from("processing_runs").update({ batch_already_processed_count: count }).eq("id", runId);
    if (error) throw new Error(`Unable to update URL batch totals: ${error.message}`);
  }

  async getTranscript(episodeId: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transcripts")
      .select("id, episode_id, content_hash, raw_text, language, segments")
      .eq("episode_id", episodeId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Unable to load transcript: ${error.message}`);
    return data ? {
      id: data.id as string,
      episodeId: data.episode_id as string,
      contentHash: data.content_hash as string,
      rawText: data.raw_text as string,
      language: data.language as string | null,
      segments: data.segments as unknown[] | null,
    } : null;
  }

  async saveTranscript(episodeId: string, transcript: NormalizedTranscriptResult, contentHash: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transcripts")
      .upsert({
        episode_id: episodeId,
        provider: transcript.providerName,
        raw_text: transcript.rawText,
        language: transcript.language ?? "und",
        duration_seconds: transcript.durationSeconds,
        segments: transcript.segments ?? null,
        content_hash: contentHash,
      }, { onConflict: "episode_id,content_hash", ignoreDuplicates: true })
      .select("id, episode_id, content_hash, raw_text, language, segments")
      .maybeSingle();

    if (error) throw new Error(`Unable to store transcript: ${error.message}`);

    let stored = data;
    if (!stored) {
      const { data: existing, error: existingError } = await supabase
        .from("transcripts")
        .select("id, episode_id, content_hash, raw_text, language, segments")
        .eq("episode_id", episodeId)
        .eq("content_hash", contentHash)
        .single();
      if (existingError) throw new Error(`Unable to load stored transcript: ${existingError.message}`);
      stored = existing;
    }

    if (transcript.durationSeconds != null) {
      const { error: durationError } = await supabase
        .from("episodes")
        .update({ duration_seconds: transcript.durationSeconds })
        .eq("id", episodeId);
      if (durationError) throw new Error(`Unable to update episode duration: ${durationError.message}`);
    }

    return {
      id: stored.id as string,
      episodeId: stored.episode_id as string,
      contentHash: stored.content_hash as string,
      rawText: stored.raw_text as string,
      language: stored.language as string | null,
      segments: stored.segments as unknown[] | null,
    };
  }

  async persistExtraction(episodeId: string, extraction: import("@/lib/insights/extractor").ExtractionResult) {
    const registry = await loadFplRegistry();
    const supabase = createSupabaseServerClient();
    const normalizedModelOutput = validateExtractionForPersistence(episodeId, extraction);
    const { data: entityRows, error: entityError } = await supabase.from("entities").select("id,type,canonical_name,aliases,external_fpl_id");
    if (entityError) throw new Error(`Unable to load canonical entities before extraction persistence: ${entityError.message}`);
    const normalized = resolveCanonicalEntitiesForPersistence(resolveExtractionEntities(normalizedModelOutput, registry), registry, entityRows.map((row) => ({ id: row.id as string, type: row.type as "PLAYER" | "TEAM", canonicalName: row.canonical_name as string, aliases: (row.aliases as string[]) ?? [], externalFplId: row.external_fpl_id as number | null })));
    const { data, error } = await supabase.rpc("persist_episode_insight_extraction", {
      target_episode_id: episodeId,
      target_extraction_version: extraction.extractionVersion,
      target_prompt_version: extraction.promptVersion,
      target_model: extraction.model,
      target_input_tokens: extraction.tokenUsage?.inputTokens ?? null,
      target_output_tokens: extraction.tokenUsage?.outputTokens ?? null,
      target_total_tokens: extraction.tokenUsage?.totalTokens ?? null,
      target_extracted_at: extraction.extractedAt,
      extracted_insights: normalized.insights,
    });
    if (error) throw new Error(`Unable to persist insight extraction: episode=${episodeId} stage=persistence ${error.message}`);
    return Number(data);
  }

  async createRunEpisode(runId: string, episodeId: string, retryCount: number) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("run_episodes").insert({
      run_id: runId,
      episode_id: episodeId,
      status: "DISCOVERED",
      retry_count: retryCount,
    });

    if (error) {
      throw new Error(`Unable to create run episode: ${error.message}`);
    }
  }

  async createCompletedRunEpisode(runId: string, episodeId: string) {
    const now = new Date().toISOString();
    const { error } = await createSupabaseServerClient().from("run_episodes").insert({
      run_id: runId, episode_id: episodeId, status: "COMPLETED", started_at: now, completed_at: now,
      transcript_status: "READY", extraction_status: "COMPLETED", retry_count: 0,
    });
    if (error) throw new Error(`Unable to attach completed video to batch: ${error.message}`);
  }

  async transitionRunEpisode(runId: string, episodeId: string, transition: EpisodeTransition) {
    const supabase = createSupabaseServerClient();
    const values: Record<string, string | null> = { status: transition.to };
    if (transition.startedAt !== undefined) values.started_at = transition.startedAt;
    if (transition.completedAt !== undefined) values.completed_at = transition.completedAt;
    if (transition.transcriptStatus !== undefined) values.transcript_status = transition.transcriptStatus;
    if (transition.extractionStatus !== undefined) values.extraction_status = transition.extractionStatus;
    if (transition.errorMessage !== undefined) values.error_message = transition.errorMessage;

    const { data, error } = await supabase
      .from("run_episodes")
      .update(values)
      .eq("run_id", runId)
      .eq("episode_id", episodeId)
      .eq("status", transition.from)
      .select("episode_id")
      .maybeSingle();

    if (error || !data) {
      throw new Error(`Unable to transition episode from ${transition.from} to ${transition.to}: ${error?.message ?? "state changed concurrently"}`);
    }
  }

  async updateRunProgress(runId: string, totals: RunTotals) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("processing_runs")
      .update({
        sources_checked: totals.sourcesChecked,
        episodes_discovered: totals.episodesDiscovered,
        episodes_processed: totals.episodesProcessed,
        episodes_failed: totals.episodesFailed,
        episodes_selected: totals.episodesSelected,
        episodes_deferred: totals.episodesDeferred,
      })
      .eq("id", runId)
      .in("status", ["RUNNING", "CANCELLING"]);

    if (error) {
      throw new Error(`Unable to update run progress: ${error.message}`);
    }
  }

  async updateCheckpoint(sourceId: string, checkpoint: SourceCheckpoint) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("source_checkpoints").upsert({
      source_id: sourceId,
      last_successful_published_at: checkpoint.lastSuccessfulPublishedAt,
      last_successful_episode_external_id: checkpoint.lastSuccessfulEpisodeExternalId,
      last_checked_at: checkpoint.lastCheckedAt,
    });

    if (error) {
      throw new Error(`Unable to update source checkpoint: ${error.message}`);
    }
  }

  async finishRun(result: ProcessingRunResult) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("processing_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: result.status,
        sources_checked: result.sourcesChecked,
        episodes_discovered: result.episodesDiscovered,
        episodes_processed: result.episodesProcessed,
        episodes_failed: result.episodesFailed,
        episodes_selected: result.episodesSelected,
        episodes_deferred: result.episodesDeferred,
        error_message: result.errors.length > 0 ? result.errors.join("\n") : null,
      })
      .eq("id", result.runId)
      .in("status", ["RUNNING", "CANCELLING"]);

    if (error) {
      throw new Error(`Unable to finish processing run: ${error.message}`);
    }
  }
}
