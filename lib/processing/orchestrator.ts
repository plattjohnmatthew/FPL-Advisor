import type { EpisodeDiscoveryProvider } from "./discovery";
import type { ProcessingRepository } from "./repository";
import { hashTranscriptContent } from "@/lib/transcripts/hash";
import type { TranscriptProvider } from "@/lib/transcripts/provider";
import type { TranscriptRequestTrigger } from "@/lib/transcripts/provider";
import type { InsightExtractor } from "@/lib/insights/extractor";
import { isRetryableFailure } from "./failure-classification";
import type {
  DiscoveredEpisode,
  EpisodeProcessingStatus,
  ProcessingRunResult,
  ProcessingSource,
  StoredEpisode,
  ProcessingFailureStage,
  SourceCheckpoint,
} from "./types";
import type { ProcessingRunOptions } from "./options";
import { isPublishedInDiscoveryWindow, LEGACY_UNBOUNDED_RUN_OPTIONS } from "./options";

type QueueEntry = { episode: StoredEpisode; retryCount: number };
export type SpecificUrlBatchEntry = QueueEntry & { videoId: string };
export interface RunSplitDecisionDetector {
  detectForRun(runId: string): Promise<number | { persistedCount: number; warnings: string[] }>;
}

function sortDiscovered(episodes: DiscoveredEpisode[]) {
  return [...episodes].sort((left, right) => {
    const publishedDifference = Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
    return publishedDifference || left.externalEpisodeId.localeCompare(right.externalEpisodeId);
  });
}

export class ProcessingRunOrchestrator {
  constructor(
    private readonly repository: ProcessingRepository,
    private readonly discoveryProvider: EpisodeDiscoveryProvider,
    private readonly transcriptProvider: TranscriptProvider,
    private readonly insightExtractor: InsightExtractor,
    private readonly splitDecisionDetector: RunSplitDecisionDetector,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(options?: ProcessingRunOptions, existingRunId?: string): Promise<ProcessingRunResult> {
    const effectiveOptions = options ?? LEGACY_UNBOUNDED_RUN_OPTIONS;
    const runId = existingRunId ?? await this.repository.createRun(effectiveOptions, effectiveOptions.selectedSourceIds);
    const totals = {
      sourcesChecked: 0,
      episodesDiscovered: 0,
      episodesProcessed: 0,
      episodesFailed: 0,
      episodesSelected: 0,
      episodesDeferred: 0,
    };
    const errors: string[] = [];

    try {
      const sources = effectiveOptions.selectedSourceIds
        ? await this.repository.listRunSources!(runId)
        : await this.repository.listEnabledSources();

      for (const source of sources) {
        if (await this.repository.isCancellationRequested(runId)) break;
        totals.sourcesChecked += 1;
        await this.repository.updateRunProgress(runId, totals);

        try {
          await this.processSource(runId, source, effectiveOptions, options !== undefined, totals, errors);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown source processing error";
          errors.push(`${source.name}: ${message}`);
          await this.recordFailure(runId, null, "SOURCE_DISCOVERY", error, message);
        }
      }

      if (!await this.repository.isCancellationRequested(runId)) {
        try {
          const splitResult = await this.splitDecisionDetector.detectForRun(runId);
          if (typeof splitResult !== "number") {
            for (const warning of splitResult.warnings) {
              await this.recordFailure(runId, null, "SPLIT_DECISION_GENERATION", new Error(warning), warning);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown split-decision detection error";
          errors.push(`Split-decision detection: ${message}`);
          await this.recordFailure(runId, null, "SPLIT_DECISION_GENERATION", error, message);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown run error";
      errors.push(message);
      await this.recordFailure(runId, null, "RUN_FINALIZATION", error, message);
    }

    const cancelled = await this.repository.isCancellationRequested(runId);
    const status: "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED" = cancelled
      ? "CANCELLED"
      : errors.length === 0 ? "COMPLETED" : totals.episodesProcessed > 0 ? "PARTIAL" : "FAILED";
    const result: ProcessingRunResult = { runId, status, ...totals, errors };
    await this.repository.finishRun(result);
    return result;
  }

  async runSpecificUrlBatch(
    runId: string,
    entries: SpecificUrlBatchEntry[],
    initial: { sourcesChecked: number; episodesDiscovered: number; alreadyProcessed: number; errors: string[] },
  ): Promise<ProcessingRunResult> {
    const totals = {
      sourcesChecked: initial.sourcesChecked, episodesDiscovered: initial.episodesDiscovered,
      episodesProcessed: 0, episodesFailed: initial.errors.length, episodesSelected: entries.length, episodesDeferred: 0,
    };
    const errors = [...initial.errors];
    await this.repository.updateRunProgress(runId, totals);
    for (const entry of entries) await this.repository.createRunEpisode(runId, entry.episode.id, entry.retryCount);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (await this.repository.isCancellationRequested(runId)) {
        for (const remaining of entries.slice(index)) {
          await this.cancelUnstartedEpisode(runId, remaining, true);
          await this.repository.updateUrlBatchItem!(runId, remaining.videoId, { status: "CANCELLED", episodeId: remaining.episode.id });
        }
        break;
      }
      await this.repository.updateUrlBatchItem!(runId, entry.videoId, { status: "PROCESSING", episodeId: entry.episode.id });
      const outcome = await this.processEpisode(runId, entry, errors, true, entry.retryCount > 0 ? "URL_BATCH_RETRY" : "URL_BATCH");
      if (outcome === "COMPLETED") totals.episodesProcessed += 1;
      else if (outcome === "FAILED") totals.episodesFailed += 1;
      await this.repository.updateUrlBatchItem!(runId, entry.videoId, {
        status: outcome, episodeId: entry.episode.id,
        errorMessage: outcome === "FAILED" ? errors.at(-1) ?? "Video processing failed." : null,
      });
      await this.repository.updateRunProgress(runId, totals);
      if (outcome === "CANCELLED") {
        for (const remaining of entries.slice(index + 1)) {
          await this.cancelUnstartedEpisode(runId, remaining, true);
          await this.repository.updateUrlBatchItem!(runId, remaining.videoId, { status: "CANCELLED", episodeId: remaining.episode.id });
        }
        break;
      }
    }
    if (!await this.repository.isCancellationRequested(runId) && totals.episodesProcessed > 0) {
      try {
        const splitResult = await this.splitDecisionDetector.detectForRun(runId);
        if (typeof splitResult !== "number") for (const warning of splitResult.warnings) await this.recordFailure(runId, null, "SPLIT_DECISION_GENERATION", new Error(warning), warning);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown split-decision detection error";
        errors.push(`Split-decision detection: ${message}`);
        await this.recordFailure(runId, null, "SPLIT_DECISION_GENERATION", error, message);
      }
    }
    const cancelled = await this.repository.isCancellationRequested(runId);
    const completedWork = totals.episodesProcessed + initial.alreadyProcessed;
    const status = cancelled ? "CANCELLED" : errors.length === 0 ? "COMPLETED" : completedWork > 0 ? "PARTIAL" : "FAILED";
    const result: ProcessingRunResult = { runId, status, ...totals, errors };
    await this.repository.finishRun(result);
    return result;
  }

  async runManualEpisode(runId: string, entry: QueueEntry, trigger: "MANUAL_RETRY" | "MANUAL_RESUME" = "MANUAL_RETRY"): Promise<ProcessingRunResult> {
    const totals = { sourcesChecked: 1, episodesDiscovered: 0, episodesProcessed: 0, episodesFailed: 0, episodesSelected: 1, episodesDeferred: 0 };
    const errors: string[] = [];
    await this.repository.updateRunProgress(runId, totals);
    const outcome = await this.processEpisode(runId, entry, errors, false, trigger);
    if (outcome === "COMPLETED") totals.episodesProcessed = 1;
    if (outcome === "FAILED") totals.episodesFailed = 1;
    const status = await this.repository.isCancellationRequested(runId) ? "CANCELLED" : outcome === "COMPLETED" ? "COMPLETED" : outcome === "FAILED" ? "FAILED" : "CANCELLED";
    const result: ProcessingRunResult = { runId, status, ...totals, errors };
    await this.repository.updateRunProgress(runId, totals);
    await this.repository.finishRun(result);
    return result;
  }

  private async processSource(
    runId: string,
    source: ProcessingSource,
    options: ProcessingRunOptions,
    scoped: boolean,
    totals: Omit<ProcessingRunResult, "runId" | "status" | "errors">,
    errors: string[],
  ) {
    const checkpoint = await this.repository.getCheckpoint(source.id);
    const retryable = (await this.repository.listRetryableEpisodes(source.id))
      .filter((episode) => isPublishedInDiscoveryWindow(episode.publishedAt, options));
    const discovered = this.deduplicateDiscovery(
      await this.discoveryProvider.discoverEpisodes(source, checkpoint, scoped ? options : undefined),
    );
    const queue = new Map<string, QueueEntry>();
    const outcomes = new Map<string, boolean>();

    for (const retry of retryable) {
      queue.set(retry.id, { episode: retry, retryCount: retry.retryCount });
    }

    for (const metadata of discovered) {
      const upserted = await this.repository.upsertEpisode(source.id, metadata);
      const history = await this.repository.getEpisodeAttemptHistory(upserted.episode.id);

      if (upserted.created) {
        totals.episodesDiscovered += 1;
      }

      if (history.completed) {
        outcomes.set(metadata.externalEpisodeId, true);
        continue;
      }

      const existing = queue.get(upserted.episode.id);
      queue.set(upserted.episode.id, {
        episode: upserted.episode,
        retryCount: Math.max(existing?.retryCount ?? 0, history.nextRetryCount),
      });
    }

    await this.repository.updateRunProgress(runId, totals);

    const ordered = [...queue.values()].sort((left, right) =>
      Date.parse(right.episode.publishedAt) - Date.parse(left.episode.publishedAt)
      || right.episode.externalEpisodeId.localeCompare(left.episode.externalEpisodeId));
    const eligible: QueueEntry[] = [];
    for (const entry of ordered) if (!await this.isEpisodePaused(entry.episode.id)) eligible.push(entry);
    const limit = source.platform === "YOUTUBE" ? options.constraints.youtube.maxVideosPerCreator : eligible.length;
    const entries = eligible.slice(0, limit);
    totals.episodesSelected += entries.length;
    totals.episodesDeferred += eligible.length - entries.length;
    await this.repository.updateRunProgress(runId, totals);
    for (const entry of entries) await this.repository.createRunEpisode(runId, entry.episode.id, entry.retryCount);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (await this.repository.isCancellationRequested(runId)) {
        for (const remaining of entries.slice(index)) await this.cancelUnstartedEpisode(runId, remaining, true);
        break;
      }
      const outcome = await this.processEpisode(runId, entry, errors, true, entry.retryCount > 0 ? "AUTOMATIC_RETRY" : "CREATOR_DISCOVERY");
      outcomes.set(entry.episode.externalEpisodeId, outcome === "COMPLETED");
      if (outcome === "COMPLETED") {
        totals.episodesProcessed += 1;
      } else if (outcome === "FAILED") {
        totals.episodesFailed += 1;
      }

      await this.repository.updateRunProgress(runId, totals);
      if (outcome === "CANCELLED") {
        for (const remaining of entries.slice(index + 1)) await this.cancelUnstartedEpisode(runId, remaining, true);
        break;
      }
    }

    if (scoped) {
      await this.repository.updateCheckpoint(source.id, {
        sourceId: source.id,
        lastSuccessfulPublishedAt: checkpoint?.lastSuccessfulPublishedAt ?? null,
        lastSuccessfulEpisodeExternalId: checkpoint?.lastSuccessfulEpisodeExternalId ?? null,
        lastCheckedAt: this.now(),
      });
    } else {
      await this.advanceCheckpoint(source.id, checkpoint, discovered, outcomes);
    }
  }

  private deduplicateDiscovery(episodes: DiscoveredEpisode[]) {
    const unique = new Map<string, DiscoveredEpisode>();

    for (const episode of episodes) {
      unique.set(episode.externalEpisodeId, episode);
    }

    return sortDiscovered([...unique.values()]);
  }

  private async processEpisode(runId: string, entry: QueueEntry, errors: string[], attemptExists = false, trigger: TranscriptRequestTrigger = "CREATOR_DISCOVERY") {
    const { episode, retryCount } = entry;
    if (!attemptExists) await this.repository.createRunEpisode(runId, episode.id, retryCount);
    let currentStatus: EpisodeProcessingStatus = "DISCOVERED";
    let currentStage: ProcessingFailureStage = "TRANSCRIPT_ACQUISITION";

    try {
      if (await this.isEpisodePaused(episode.id)) {
        await this.pauseEpisode(runId, episode.id, "DISCOVERED");
        return "PAUSED" as const;
      }
      if (await this.repository.isCancellationRequested(runId)) {
        await this.cancelEpisode(runId, episode.id, "DISCOVERED");
        return "CANCELLED" as const;
      }
      await this.repository.transitionRunEpisode(runId, episode.id, {
        from: "DISCOVERED",
        to: "TRANSCRIPT_FETCHING",
        startedAt: this.now(),
        transcriptStatus: "FETCHING",
      });
      currentStatus = "TRANSCRIPT_FETCHING";
      let storedTranscript = await this.repository.getTranscript(episode.id);
      if (!storedTranscript) {
        if (await this.repository.isCancellationRequested(runId)) {
          await this.cancelEpisode(runId, episode.id, "TRANSCRIPT_FETCHING");
          return "CANCELLED" as const;
        }
        const transcript = await this.transcriptProvider.acquireTranscript(episode, { processingRunId: runId, trigger, transcriptExistedBeforeCall: false });
        storedTranscript = await this.repository.saveTranscript(
          episode.id,
          transcript,
          hashTranscriptContent(transcript.rawText),
        );
      }
      await this.repository.transitionRunEpisode(runId, episode.id, {
        from: "TRANSCRIPT_FETCHING",
        to: "TRANSCRIPT_READY",
        transcriptStatus: "READY",
      });
      currentStatus = "TRANSCRIPT_READY";
      if (await this.isEpisodePaused(episode.id)) {
        await this.pauseEpisode(runId, episode.id, "TRANSCRIPT_READY");
        return "PAUSED" as const;
      }
      if (await this.repository.isCancellationRequested(runId)) {
        await this.cancelEpisode(runId, episode.id, "TRANSCRIPT_READY");
        return "CANCELLED" as const;
      }
      currentStage = "EXTRACTION";
      await this.repository.transitionRunEpisode(runId, episode.id, {
        from: "TRANSCRIPT_READY",
        to: "EXTRACTING",
        extractionStatus: "EXTRACTING",
      });
      currentStatus = "EXTRACTING";
      if (await this.repository.isCancellationRequested(runId)) {
        await this.cancelEpisode(runId, episode.id, "EXTRACTING");
        return "CANCELLED" as const;
      }
      if (!await this.repository.hasPersistedExtraction(episode.id)) {
        const extraction = await this.insightExtractor.extract(episode, storedTranscript);
        currentStage = "EXTRACTION_PERSISTENCE";
        await this.repository.persistExtraction(episode.id, extraction);
      }
      await this.repository.transitionRunEpisode(runId, episode.id, {
        from: "EXTRACTING",
        to: "COMPLETED",
        completedAt: this.now(),
        extractionStatus: "COMPLETED",
      });
      return "COMPLETED" as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown episode processing error";
      errors.push(`${episode.externalEpisodeId}: ${message}`);
      await this.recordFailure(runId, episode.id, currentStage, error, message);
      try {
        await this.repository.transitionRunEpisode(runId, episode.id, {
          from: currentStatus,
          to: "FAILED",
          completedAt: this.now(),
          transcriptStatus: currentStatus === "TRANSCRIPT_FETCHING" ? "FAILED" : undefined,
          extractionStatus: currentStatus === "EXTRACTING" ? "FAILED" : undefined,
          errorMessage: message,
        });
      } catch (transitionError) {
        const transitionMessage = transitionError instanceof Error ? transitionError.message : "Unable to persist failed episode state";
        errors.push(`${episode.externalEpisodeId}: ${transitionMessage}`);
        await this.recordFailure(runId, episode.id, "RUN_FINALIZATION", transitionError, transitionMessage);
      }
      return "FAILED" as const;
    }
  }

  private async cancelUnstartedEpisode(runId: string, entry: QueueEntry, attemptExists = false) {
    if (!attemptExists) await this.repository.createRunEpisode(runId, entry.episode.id, entry.retryCount);
    await this.cancelEpisode(runId, entry.episode.id, "DISCOVERED");
  }

  private async cancelEpisode(runId: string, episodeId: string, from: EpisodeProcessingStatus) {
    await this.repository.transitionRunEpisode(runId, episodeId, {
      from, to: "CANCELLED", completedAt: this.now(),
      transcriptStatus: from === "TRANSCRIPT_FETCHING" ? "PENDING" : undefined,
    });
  }

  private async pauseEpisode(runId: string, episodeId: string, from: "DISCOVERED" | "TRANSCRIPT_READY") {
    await this.repository.transitionRunEpisode(runId, episodeId, {
      from, to: "PAUSED", completedAt: this.now(),
      transcriptStatus: from === "TRANSCRIPT_READY" ? "READY" : undefined,
    });
  }

  private async isEpisodePaused(episodeId: string) {
    return (await this.repository.isEpisodePaused?.(episodeId)) ?? false;
  }

  private async recordFailure(runId: string, episodeId: string | null, stage: ProcessingFailureStage, error: unknown, message: string) {
    try {
      await this.repository.recordFailure({
        runId, episodeId, stage, errorMessage: message,
        retryable: isRetryableFailure(error), occurredAt: this.now(),
      });
    } catch (recordingError) {
      console.error("Unable to persist processing failure", recordingError);
    }
  }

  private async advanceCheckpoint(sourceId: string, existing: SourceCheckpoint | null, discovered: DiscoveredEpisode[], outcomes: ReadonlyMap<string, boolean>) {
    let publishedAt = existing?.lastSuccessfulPublishedAt ?? null;
    let externalEpisodeId = existing?.lastSuccessfulEpisodeExternalId ?? null;
    for (const episode of discovered) {
      if (!outcomes.get(episode.externalEpisodeId)) break;
      publishedAt = episode.publishedAt;
      externalEpisodeId = episode.externalEpisodeId;
    }
    await this.repository.updateCheckpoint(sourceId, {
      sourceId, lastSuccessfulPublishedAt: publishedAt,
      lastSuccessfulEpisodeExternalId: externalEpisodeId, lastCheckedAt: this.now(),
    });
  }

}
