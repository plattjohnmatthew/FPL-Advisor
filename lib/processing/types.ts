export type ProcessingRunStatus = "RUNNING" | "CANCELLING" | "CANCELLED" | "COMPLETED" | "PARTIAL" | "FAILED";

export type EpisodeProcessingStatus =
  | "DISCOVERED"
  | "TRANSCRIPT_FETCHING"
  | "TRANSCRIPT_READY"
  | "EXTRACTING"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED"
  | "CANCELLED";

export type TranscriptProcessingStatus = "PENDING" | "FETCHING" | "READY" | "FAILED";
export type ExtractionProcessingStatus = "PENDING" | "EXTRACTING" | "COMPLETED" | "FAILED";

export type ProcessingSource = {
  id: string;
  name: string;
  platform: "YOUTUBE" | "PODCAST";
  channelUrl: string;
  externalChannelId: string;
};

export type SourceCheckpoint = {
  sourceId: string;
  lastSuccessfulPublishedAt: string | null;
  lastSuccessfulEpisodeExternalId: string | null;
  lastCheckedAt: string | null;
};

export type DiscoveredEpisode = {
  externalEpisodeId: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  durationSeconds: number | null;
  gameweek: number | null;
};

export type StoredEpisode = DiscoveredEpisode & {
  id: string;
  sourceId: string;
};

export type EpisodeAttemptHistory = {
  completed: boolean;
  nextRetryCount: number;
};

export type RunTotals = {
  sourcesChecked: number;
  episodesDiscovered: number;
  episodesProcessed: number;
  episodesFailed: number;
  episodesSelected: number;
  episodesDeferred: number;
};

export type ProcessingRunResult = RunTotals & {
  runId: string;
  status: Exclude<ProcessingRunStatus, "RUNNING" | "CANCELLING">;
  errors: string[];
};

export type ProcessingFailureStage =
  | "SOURCE_DISCOVERY" | "TRANSCRIPT_ACQUISITION" | "EXTRACTION" | "EXTRACTION_PERSISTENCE"
  | "SPLIT_DECISION_GENERATION" | "RUN_SYNTHESIS" | "RUN_FINALIZATION";

export type ProcessingFailure = {
  runId: string;
  episodeId: string | null;
  stage: ProcessingFailureStage;
  errorMessage: string;
  retryable: boolean;
  occurredAt: string;
};
