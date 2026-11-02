import type {
  DiscoveredEpisode,
  EpisodeAttemptHistory,
  EpisodeProcessingStatus,
  ExtractionProcessingStatus,
  ProcessingRunResult,
  ProcessingFailure,
  RunTotals,
  ProcessingSource,
  SourceCheckpoint,
  StoredEpisode,
  TranscriptProcessingStatus,
} from "./types";
import type { NormalizedTranscriptResult } from "@/lib/transcripts/provider";
import type { ExtractionResult } from "@/lib/insights/extractor";
import type { ProcessingRunOptions } from "./options";
import type { NormalizedUrlItem } from "./youtube-url-batch";
import type { TranscriptProviderCallRecord } from "@/lib/transcripts/audited-provider";

export type StoredTranscript = {
  id: string;
  episodeId: string;
  contentHash: string;
  rawText: string;
  language: string | null;
  segments: unknown[] | null;
};

export type EpisodeTransition = {
  from: EpisodeProcessingStatus;
  to: EpisodeProcessingStatus;
  startedAt?: string;
  completedAt?: string;
  transcriptStatus?: TranscriptProcessingStatus;
  extractionStatus?: ExtractionProcessingStatus;
  errorMessage?: string | null;
};

export interface ProcessingRepository {
  createRun(options: ProcessingRunOptions, selectedSourceIds?: string[]): Promise<string>;
  requestCancellation(runId: string): Promise<boolean>;
  isCancellationRequested(runId: string): Promise<boolean>;
  listEnabledSources(): Promise<ProcessingSource[]>;
  listRunSources?(runId: string): Promise<ProcessingSource[]>;
  getCheckpoint(sourceId: string): Promise<SourceCheckpoint | null>;
  listRetryableEpisodes(sourceId: string): Promise<Array<StoredEpisode & { retryCount: number }>>;
  upsertEpisode(
    sourceId: string,
    episode: DiscoveredEpisode,
  ): Promise<{ episode: StoredEpisode; created: boolean }>;
  getEpisodeAttemptHistory(episodeId: string): Promise<EpisodeAttemptHistory>;
  hasPersistedExtraction(episodeId: string): Promise<boolean>;
  getTranscript(episodeId: string): Promise<StoredTranscript | null>;
  saveTranscript(episodeId: string, transcript: NormalizedTranscriptResult, contentHash: string): Promise<StoredTranscript>;
  persistExtraction(episodeId: string, extraction: ExtractionResult): Promise<number>;
  createRunEpisode(runId: string, episodeId: string, retryCount: number): Promise<void>;
  createCompletedRunEpisode?(runId: string, episodeId: string): Promise<void>;
  createSpecificUrlBatchRun?(items: NormalizedUrlItem[]): Promise<string>;
  findEpisodeByExternalId?(externalEpisodeId: string): Promise<StoredEpisode | null>;
  isEpisodeFullyProcessed?(episodeId: string): Promise<boolean>;
  getEpisode?(episodeId: string): Promise<StoredEpisode | null>;
  createManualEpisodeRun?(episode: StoredEpisode): Promise<string>;
  setEpisodePaused?(episodeId: string, paused: boolean): Promise<void>;
  isEpisodePaused?(episodeId: string): Promise<boolean>;
  recordTranscriptProviderCall?(record: TranscriptProviderCallRecord): Promise<void>;
  markTranscriptProviderFallbackUsed?(record: { provider: string; episodeId: string; processingRunId: string | null; fallbackProvider: string; fallbackReason: string }): Promise<void>;
  linkRunSource?(runId: string, sourceId: string): Promise<void>;
  updateUrlBatchItem?(runId: string, videoId: string, values: { status: string; episodeId?: string; errorMessage?: string | null }): Promise<void>;
  updateUrlBatchAlreadyProcessedCount?(runId: string, count: number): Promise<void>;
  transitionRunEpisode(runId: string, episodeId: string, transition: EpisodeTransition): Promise<void>;
  updateRunProgress(runId: string, totals: RunTotals): Promise<void>;
  updateCheckpoint(sourceId: string, checkpoint: SourceCheckpoint): Promise<void>;
  finishRun(result: ProcessingRunResult): Promise<void>;
  recordFailure(failure: ProcessingFailure): Promise<void>;
}

export class RunAlreadyInProgressError extends Error {
  constructor() {
    super("A processing run is already in progress.");
    this.name = "RunAlreadyInProgressError";
  }
}
