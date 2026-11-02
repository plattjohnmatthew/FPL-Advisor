import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardEpisode, DashboardSnapshot } from "./types";
import type { EpisodeProcessingStatus, ProcessingRunStatus } from "@/lib/processing/types";
import { SupabaseRunSummaryRepository } from "@/lib/summaries/repository";
import { RunSummarySchema } from "@/lib/summaries/schema";
import { batchValues } from "@/lib/supabase/batch";
import { latestSevenLocalDates, localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";
import { composePromptVersion } from "@/lib/prompt-settings/config";
import { RUN_SUMMARY_PROMPT_VERSION } from "@/lib/summaries/prompt";
import { applyCreatorAggregation } from "@/lib/summaries/service";
import { CurrentSquadContextService } from "@/lib/fpl-entry/context";

type RunEpisodeRow = { episode_id: string; status: EpisodeProcessingStatus; error_message: string | null; retry_count: number; transcript_status: DashboardEpisode["transcriptStatus"]; extraction_status: DashboardEpisode["extractionStatus"]; started_at: string | null; completed_at: string | null; failure_dismissed_at: string | null };
type EpisodeRow = { id: string; source_id: string; title: string; source_url: string; published_at?: string; insights?: Array<{ id: string }> };
type SourceRow = { id: string; name: string };

export function setsDiffer(left: string[], right: string[]) {
  const a = new Set(left); const b = new Set(right);
  return a.size !== b.size || [...a].some((id) => !b.has(id));
}

export function emptyDashboardSnapshot(loadError: string | null = null): DashboardSnapshot {
  return {
    aiInstructions: {
      extraction: { value: "", version: 1, updatedAt: "" },
      synthesis: { value: "", version: 1, updatedAt: "" },
    },
    lastSuccessfulIngestionAt: null,
    enabledSourcesCount: 0, sourceLibrary: [], squadEntityIds: [], latestRunSources: [], sourcesChecked: 0, latestRunId: null, lastRunAt: null, currentRunStatus: "NOT_STARTED",
    runType: null, batchSubmittedCount: 0, batchEligibleCount: 0, batchDuplicateCount: 0, batchInvalidCount: 0, batchAlreadyProcessedCount: 0, batchItems: [],
    activeSourceNames: [], episodesDiscovered: 0, episodesSelected: 0, episodesDeferred: 0,
    discoveryStart: null, discoveryEnd: null, youtubeMaxVideosPerCreator: null,
    completedCount: 0, failedCount: 0, cancelledCount: 0, episodes: [], retryableEpisodes: [], recentEpisodes: [], recentInsights: [],
    defaultPeriodLabel: "Last 7 days", defaultFromDate: "", defaultToDate: "",
    summaryText: null, synthesis: null, keyInsights: [], supportingInsights: [], splitDecisions: [], runFailures: [],
    reportError: null, synthesisScopeLabel: null, synthesisIncludedCount: 0, synthesisEligibleCount: 0, synthesisExcludedCount: 0,
    synthesisExcludedEpisodes: [], synthesisDistinctCreatorCount: 0, synthesisModel: null, synthesisPromptVersion: null,
    synthesisAttemptError: null, synthesisStale: false, synthesisInstructionsStale: false, synthesisGeneratedAt: null, loadError,
  };
}

export async function getDashboardSnapshot(
  timezoneOffsetMinutes = 0,
  now = new Date(),
  requestedPeriod?: { fromDate: string; toDate: string },
): Promise<DashboardSnapshot> {
  const supabase = createSupabaseServerClient();
  const squadContext = await new CurrentSquadContextService().getCurrent().catch(() => null);
  const promptSettings = await new SupabasePromptSettingsRepository().getAll();
  const period = requestedPeriod
    ? { ...requestedPeriod, ...localDateRangeToUtcBounds(requestedPeriod.fromDate, requestedPeriod.toDate, timezoneOffsetMinutes) }
    : latestSevenLocalDates(now, timezoneOffsetMinutes);
  const { data: recentRows, error: recentError } = await supabase.from("episodes")
    .select("id, source_id, title, source_url, published_at, sources(name), transcripts(id), insights(id)")
    .gte("published_at", period.startInclusive).lt("published_at", period.endExclusive).order("published_at", { ascending: false });
  if (recentError) throw new Error(`Unable to load recent persisted episodes: ${recentError.message}`);

  const latestRecentAttempts = new Map<string, { status: EpisodeProcessingStatus; transcript_status: DashboardEpisode["transcriptStatus"]; extraction_status: DashboardEpisode["extractionStatus"] }>();
  for (const batch of batchValues(recentRows.map((row) => row.id as string))) {
    const { data, error } = await supabase.from("latest_episode_processing_attempts")
      .select("episode_id, status, transcript_status, extraction_status").in("episode_id", batch);
    if (error) throw new Error(`Unable to load episode states: ${error.message}`);
    for (const attempt of data) latestRecentAttempts.set(attempt.episode_id as string, { status: attempt.status as EpisodeProcessingStatus, transcript_status: attempt.transcript_status as DashboardEpisode["transcriptStatus"], extraction_status: attempt.extraction_status as DashboardEpisode["extractionStatus"] });
  }
  const recentEpisodes: DashboardEpisode[] = recentRows.flatMap((row) => {
    const latestAttempt = latestRecentAttempts.get(row.id as string);
    const insightCount = (row.insights as Array<{ id: string }>).length; const transcriptCount = (row.transcripts as Array<{ id: string }>).length;
    return [{
      episodeId: row.id as string, title: row.title as string, sourceUrl: row.source_url as string,
      sourceName: (row.sources as unknown as { name: string } | null)?.name ?? "Unknown source",
      publishedAt: row.published_at as string, insightCount, status: latestAttempt?.status ?? "DISCOVERED",
      transcriptStatus: latestAttempt?.transcript_status ?? (transcriptCount ? "READY" : "PENDING"), extractionStatus: latestAttempt?.extraction_status ?? (insightCount ? "COMPLETED" : "PENDING"),
      errorMessage: null, retryCount: 0, errorStage: null, errorRetryable: null,
    }];
  });
  const eligibleEpisodeIds = recentEpisodes.filter((episode) => episode.transcriptStatus === "READY" && episode.insightCount > 0).map((episode) => episode.episodeId);
  const recentInsightIds = recentRows.filter((row) => eligibleEpisodeIds.includes(row.id as string)).flatMap((row) => (row.insights as Array<{ id: string }>).map((item) => item.id));
  const summaryRepository = new SupabaseRunSummaryRepository();
  const recentInsights = await summaryRepository.loadInsightsForDisplay(recentInsightIds);

  const [{ data: libraryRows, error: sourceError }, { data: latestRun, error: runError }, successfulRun] = await Promise.all([
    supabase.from("sources").select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default").order("name"),
    supabase.from("processing_runs").select("id, started_at, status, run_type, sources_checked, episodes_discovered, episodes_selected, episodes_deferred, discovery_start, discovery_end, youtube_max_videos_per_creator, batch_submitted_count, batch_eligible_count, batch_duplicate_count, batch_invalid_count, batch_already_processed_count").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("processing_runs").select("completed_at").eq("status", "COMPLETED").not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sourceError) throw new Error(`Unable to count enabled sources: ${sourceError.message}`);
  if (runError) throw new Error(`Unable to load latest processing run: ${runError.message}`);
  if (successfulRun.error) throw new Error(`Unable to load last successful ingestion: ${successfulRun.error.message}`);

  let attempts: RunEpisodeRow[] = []; const episodeRows: EpisodeRow[] = []; let sourceRows: SourceRow[] = []; let failureData: Array<Record<string, unknown>> = []; let latestRunSources: Array<{ id: string; name: string }> = []; let batchItems: DashboardSnapshot["batchItems"] = [];
  if (latestRun) {
    const [{ data: attemptData, error: attemptError }, { data: failures, error: failureError }, { data: runSources, error: runSourcesError }] = await Promise.all([
      supabase.from("run_episodes").select("episode_id, status, error_message, retry_count, transcript_status, extraction_status, started_at, completed_at, failure_dismissed_at").eq("run_id", latestRun.id),
      supabase.from("processing_failures").select("episode_id, stage, error_message, retryable, occurred_at").eq("run_id", latestRun.id).order("occurred_at", { ascending: false }),
      supabase.from("processing_run_sources").select("source_id, sources!inner(name)").eq("processing_run_id", latestRun.id).order("created_at"),
    ]);
    if (attemptError) throw new Error(`Unable to load run episodes: ${attemptError.message}`);
    if (failureError) throw new Error(`Unable to load processing failures: ${failureError.message}`);
    if (runSourcesError) throw new Error(`Unable to load historical run sources: ${runSourcesError.message}`);
    latestRunSources = runSources.map((row) => ({ id: row.source_id as string, name: (row.sources as unknown as { name: string }).name }));
    attempts = attemptData as RunEpisodeRow[]; failureData = failures;
    for (const batch of batchValues(attempts.map((attempt) => attempt.episode_id))) {
      const { data, error } = await supabase.from("episodes").select("id, source_id, title, source_url, published_at, insights(id)").in("id", batch);
      if (error) throw new Error(`Unable to load episode details: ${error.message}`); episodeRows.push(...data as EpisodeRow[]);
    }
    const sourceIds = [...new Set(episodeRows.map((episode) => episode.source_id))];
    if (sourceIds.length > 0) {
      const { data, error } = await supabase.from("sources").select("id, name").in("id", sourceIds);
      if (error) throw new Error(`Unable to load episode sources: ${error.message}`); sourceRows = data as SourceRow[];
    }
    if (latestRun.run_type === "SPECIFIC_URL_BATCH") {
      const { data, error } = await supabase.from("processing_run_url_items")
        .select("line_number, submitted_url, normalized_url, video_id, status, error_message, episode_id, updated_at, episodes(title, source_url, sources(name))")
        .eq("run_id", latestRun.id).order("line_number");
      if (error) throw new Error(`Unable to load URL batch results: ${error.message}`);
      batchItems = data.map((item) => {
        const episode = item.episodes as unknown as { title: string; source_url: string; sources: { name: string } | null } | null;
        return { updatedAt: item.updated_at as string | null, lineNumber: Number(item.line_number), submittedUrl: item.submitted_url as string, normalizedUrl: item.normalized_url as string | null,
          videoId: item.video_id as string | null, status: item.status as string, errorMessage: item.error_message as string | null,
          episodeId: item.episode_id as string | null, episodeTitle: episode?.title ?? null, sourceUrl: episode?.source_url ?? null, sourceName: episode?.sources?.name ?? null };
      });
    }
  }
  const episodeById = new Map(episodeRows.map((episode) => [episode.id, episode])); const sourceById = new Map(sourceRows.map((source) => [source.id, source.name]));
  const latestFailureByEpisode = new Map<string, Record<string, unknown>>();
  for (const failure of failureData) if (failure.episode_id && !latestFailureByEpisode.has(failure.episode_id as string)) latestFailureByEpisode.set(failure.episode_id as string, failure);
  const episodes: DashboardEpisode[] = attempts.map((attempt) => {
    const episode = episodeById.get(attempt.episode_id); const failure = latestFailureByEpisode.get(attempt.episode_id);
    return { episodeId: attempt.episode_id, sourceName: episode ? sourceById.get(episode.source_id) ?? "Unknown source" : "Unknown source", title: episode?.title ?? "Unknown episode", sourceUrl: episode?.source_url ?? null,
      runId: latestRun!.id as string, attemptStartedAt: attempt.started_at, attemptCompletedAt: attempt.completed_at, failureDismissedAt: attempt.failure_dismissed_at,
      status: attempt.status, transcriptStatus: attempt.transcript_status, extractionStatus: attempt.extraction_status,
      errorMessage: attempt.error_message, retryCount: attempt.retry_count, errorStage: failure?.stage as DashboardEpisode["errorStage"] ?? null,
      errorRetryable: failure ? Boolean(failure.retryable) : null, publishedAt: episode?.published_at ?? null, insightCount: episode?.insights?.length ?? 0 };
  });
  const active = new Set<EpisodeProcessingStatus>(["DISCOVERED", "TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"]);

  const { data: unresolvedRows, error: unresolvedError } = await supabase.from("latest_episode_processing_attempts")
    .select("episode_id, run_id, status, error_message, retry_count, transcript_status, extraction_status, started_at, completed_at, failure_dismissed_at")
    .in("status", ["FAILED", "CANCELLED"]).is("failure_dismissed_at", null).order("started_at", { ascending: false });
  if (unresolvedError) throw new Error(`Unable to load unresolved episode failures: ${unresolvedError.message}`);
  const { data: pendingRows, error: pendingError } = await supabase.from("latest_episode_processing_attempts")
    .select("episode_id, run_id, status, error_message, retry_count, transcript_status, extraction_status, started_at, completed_at, failure_dismissed_at")
    .in("status", ["DISCOVERED", "PAUSED", "TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"]);
  if (pendingError) throw new Error(`Unable to load pending episode attempts: ${pendingError.message}`);
  const operationRows = [...unresolvedRows, ...pendingRows];
  const unresolvedIds = operationRows.map((row) => row.episode_id as string);
  const unresolvedEpisodeRows: Array<EpisodeRow & { sources: { name: string } | null }> = [];
  const unresolvedFailureRows: Array<Record<string, unknown>> = [];
  for (const batch of batchValues(unresolvedIds)) {
    const [{ data: failedEpisodes, error: failedEpisodeError }, { data: failedDetails, error: failedDetailError }] = await Promise.all([
      supabase.from("episodes").select("id, source_id, title, source_url, published_at, insights(id), sources(name)").in("id", batch),
      supabase.from("processing_failures").select("episode_id, stage, retryable, occurred_at").in("episode_id", batch).order("occurred_at", { ascending: false }),
    ]);
    if (failedEpisodeError) throw new Error(`Unable to load unresolved episode details: ${failedEpisodeError.message}`);
    if (failedDetailError) throw new Error(`Unable to load unresolved failure details: ${failedDetailError.message}`);
    unresolvedEpisodeRows.push(...failedEpisodes as unknown as Array<EpisodeRow & { sources: { name: string } | null }>);
    unresolvedFailureRows.push(...failedDetails);
  }
  const unresolvedEpisodeById = new Map(unresolvedEpisodeRows.map((episode) => [episode.id, episode]));
  const unresolvedFailureByEpisode = new Map<string, Record<string, unknown>>();
  for (const failure of unresolvedFailureRows) if (!unresolvedFailureByEpisode.has(failure.episode_id as string)) unresolvedFailureByEpisode.set(failure.episode_id as string, failure);
  const operationEpisodes: DashboardEpisode[] = operationRows.map((attempt) => {
    const episode = unresolvedEpisodeById.get(attempt.episode_id as string);
    const failure = ["FAILED", "CANCELLED"].includes(attempt.status as string) ? unresolvedFailureByEpisode.get(attempt.episode_id as string) : undefined;
    return {
      episodeId: attempt.episode_id as string, sourceName: episode?.sources?.name ?? "Unknown source", title: episode?.title ?? "Unknown episode", sourceUrl: episode?.source_url ?? null,
      runId: attempt.run_id as string, attemptStartedAt: attempt.started_at as string | null, attemptCompletedAt: attempt.completed_at as string | null, failureDismissedAt: attempt.failure_dismissed_at as string | null,
      status: attempt.status as EpisodeProcessingStatus, transcriptStatus: attempt.transcript_status as DashboardEpisode["transcriptStatus"], extractionStatus: attempt.extraction_status as DashboardEpisode["extractionStatus"],
      errorMessage: attempt.error_message as string | null, retryCount: Number(attempt.retry_count), errorStage: failure?.stage as DashboardEpisode["errorStage"] ?? null,
      errorRetryable: failure ? Boolean(failure.retryable) : null, publishedAt: episode?.published_at ?? null, insightCount: episode?.insights?.length ?? 0,
    };
  });

  const retryableEpisodes = operationEpisodes.filter((episode) => ["FAILED", "CANCELLED"].includes(episode.status));

  let synthesis: DashboardSnapshot["synthesis"] = null; let summaryText: string | null = null; let supportingInsights: DashboardSnapshot["supportingInsights"] = [];
  let splitDecisions: DashboardSnapshot["splitDecisions"] = []; let reportError: string | null = null; let synthesisIncludedCount = 0; let synthesisEligibleCount = 0; let synthesisExcludedCount = 0;
  let synthesisExcludedEpisodes: DashboardSnapshot["synthesisExcludedEpisodes"] = []; let synthesisDistinctCreatorCount = 0; let synthesisModel: string | null = null; let synthesisPromptVersion: string | null = null;
  let synthesisStale = false; let synthesisInstructionsStale = false; let synthesisGeneratedAt: string | null = null; let synthesisAttemptError: string | null = null;
  try {
    const { data: stored, error } = await supabase.from("run_summaries")
      .select("id, summary_text, summary_data, generated_at, model, prompt_version, eligible_episode_count, included_episode_count, excluded_episodes, distinct_creator_count, synthesis_episodes(episode_id)")
      .eq("scope_type", "DATE_RANGE").eq("from_date", period.fromDate).eq("to_date", period.toDate)
      .order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Unable to load stored seven-day synthesis: ${error.message}`);
    if (stored) {
      synthesis = RunSummarySchema.parse(stored.summary_data); summaryText = stored.summary_text as string; synthesisGeneratedAt = stored.generated_at as string;
      const includedIds = (stored.synthesis_episodes as Array<{ episode_id: string }>).map((item) => item.episode_id);
      synthesisEligibleCount = Number(stored.eligible_episode_count); synthesisIncludedCount = Number(stored.included_episode_count);
      synthesisExcludedEpisodes = stored.excluded_episodes as DashboardSnapshot["synthesisExcludedEpisodes"];
      synthesisExcludedCount = synthesisExcludedEpisodes.length; synthesisDistinctCreatorCount = Number(stored.distinct_creator_count);
      synthesisModel = stored.model as string; synthesisPromptVersion = stored.prompt_version as string;
      synthesisStale = setsDiffer(eligibleEpisodeIds, includedIds);
      synthesisInstructionsStale = synthesisPromptVersion !== composePromptVersion(
        RUN_SUMMARY_PROMPT_VERSION,
        promptSettings.SYNTHESIS_CUSTOM_INSTRUCTIONS.version,
      );
      const context = await summaryRepository.loadDateRangeContext(period.fromDate, period.toDate, timezoneOffsetMinutes);
      synthesis = applyCreatorAggregation(synthesis, context.insights);
      const cited = new Set([...synthesis.overviewSupportingInsightIds, ...Object.values(synthesis.sections).flatMap((items) => items.flatMap((item) => item.supportingInsightIds))]);
      supportingInsights = context.insights.filter((item) => cited.has(item.id)); splitDecisions = context.splitDecisions.filter((item) => synthesis!.splitDecisionIds.includes(item.id));
    }
    const { data: attempt } = await supabase.from("synthesis_attempts").select("status, error_message")
      .eq("scope_type", "DATE_RANGE").eq("from_date", period.fromDate).eq("to_date", period.toDate).order("requested_at", { ascending: false }).limit(1).maybeSingle();
    synthesisAttemptError = attempt?.status === "FAILED" ? attempt.error_message as string : null;
  } catch (error) { reportError = error instanceof Error ? error.message : "Unable to load the stored seven-day synthesis."; }

  return {
    ...emptyDashboardSnapshot(),
    lastSuccessfulIngestionAt: successfulRun.data?.completed_at as string | null ?? null,
    aiInstructions: {
      extraction: promptSettings.EXTRACTION_CUSTOM_INSTRUCTIONS,
      synthesis: promptSettings.SYNTHESIS_CUSTOM_INSTRUCTIONS,
    },
    enabledSourcesCount: libraryRows.filter((row) => row.enabled).length,
    squadEntityIds: squadContext?.entityIds ?? [],
    sourceLibrary: libraryRows.map((row) => ({ id: row.id as string, name: row.name as string, platform: row.platform as "YOUTUBE" | "PODCAST", channelUrl: row.channel_url as string, externalChannelId: row.external_channel_id as string, enabled: Boolean(row.enabled), selectedByDefault: Boolean(row.selected_by_default) })), latestRunSources,
    sourcesChecked: Number(latestRun?.sources_checked ?? 0), latestRunId: latestRun?.id as string ?? null, lastRunAt: latestRun?.started_at as string ?? null,
    currentRunStatus: latestRun?.status as ProcessingRunStatus ?? "NOT_STARTED",
    runType: latestRun?.run_type as DashboardSnapshot["runType"] ?? null,
    batchSubmittedCount: Number(latestRun?.batch_submitted_count ?? 0), batchEligibleCount: Number(latestRun?.batch_eligible_count ?? 0),
    batchDuplicateCount: Number(latestRun?.batch_duplicate_count ?? 0), batchInvalidCount: Number(latestRun?.batch_invalid_count ?? 0),
    batchAlreadyProcessedCount: Number(latestRun?.batch_already_processed_count ?? 0), batchItems,
    activeSourceNames: [...new Set(episodes.filter((episode) => active.has(episode.status)).map((episode) => episode.sourceName))],
    episodesDiscovered: Number(latestRun?.episodes_discovered ?? 0), episodesSelected: Number(latestRun?.episodes_selected ?? 0), episodesDeferred: Number(latestRun?.episodes_deferred ?? 0),
    discoveryStart: latestRun?.discovery_start as string ?? null, discoveryEnd: latestRun?.discovery_end as string ?? null, youtubeMaxVideosPerCreator: latestRun?.youtube_max_videos_per_creator as number ?? null,
    completedCount: episodes.filter((episode) => episode.status === "COMPLETED").length, failedCount: episodes.filter((episode) => episode.status === "FAILED").length, cancelledCount: episodes.filter((episode) => episode.status === "CANCELLED").length,
    episodes, retryableEpisodes, operationEpisodes, recentEpisodes, recentInsights, defaultPeriodLabel: `${period.fromDate} to ${period.toDate}`, defaultFromDate: period.fromDate, defaultToDate: period.toDate,
    summaryText, synthesis, keyInsights: recentInsights, supportingInsights, splitDecisions,
    runFailures: failureData.filter((item) => !item.episode_id).map((item) => ({ stage: item.stage as DashboardSnapshot["runFailures"][number]["stage"], errorMessage: item.error_message as string, retryable: Boolean(item.retryable), occurredAt: item.occurred_at as string })),
    reportError, synthesisScopeLabel: synthesis ? `${period.fromDate} to ${period.toDate}` : null, synthesisIncludedCount, synthesisEligibleCount, synthesisExcludedCount,
    synthesisExcludedEpisodes, synthesisDistinctCreatorCount, synthesisModel, synthesisPromptVersion,
    synthesisAttemptError, synthesisStale, synthesisInstructionsStale, synthesisGeneratedAt, loadError: null,
  };
}
