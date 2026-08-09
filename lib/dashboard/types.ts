import type { EpisodeProcessingStatus, ExtractionProcessingStatus, ProcessingRunStatus, TranscriptProcessingStatus } from "@/lib/processing/types";
import type { ProcessingFailureStage } from "@/lib/processing/types";
import type { RunSummary, SummaryInsightContext, SummarySplitContext } from "@/lib/summaries/schema";
import type { SourceLibraryItem } from "@/lib/sources/types";

export type DashboardEpisode = {
  episodeId: string;
  sourceName: string;
  title: string;
  sourceUrl: string | null;
  status: EpisodeProcessingStatus;
  errorMessage: string | null;
  retryCount: number;
  errorStage: ProcessingFailureStage | null;
  errorRetryable: boolean | null;
  publishedAt: string | null;
  insightCount: number;
  transcriptStatus: TranscriptProcessingStatus;
  extractionStatus: ExtractionProcessingStatus;
};

export type DashboardRunFailure = {
  stage: ProcessingFailureStage;
  errorMessage: string;
  retryable: boolean;
  occurredAt: string;
};

export type DashboardUrlBatchItem = {
  lineNumber: number; submittedUrl: string; normalizedUrl: string | null; videoId: string | null;
  status: string; errorMessage: string | null; episodeId: string | null;
  episodeTitle: string | null; sourceUrl: string | null; sourceName: string | null;
};

export type DashboardSnapshot = {
  aiInstructions: {
    extraction: { value: string; version: number; updatedAt: string };
    synthesis: { value: string; version: number; updatedAt: string };
  };
  enabledSourcesCount: number;
  sourceLibrary: SourceLibraryItem[];
  latestRunSources: Array<{ id: string; name: string }>;
  sourcesChecked: number;
  latestRunId: string | null;
  lastRunAt: string | null;
  currentRunStatus: ProcessingRunStatus | "NOT_STARTED";
  runType: "CREATOR_DISCOVERY" | "SPECIFIC_URL_BATCH" | null;
  batchSubmittedCount: number;
  batchEligibleCount: number;
  batchDuplicateCount: number;
  batchInvalidCount: number;
  batchAlreadyProcessedCount: number;
  batchItems: DashboardUrlBatchItem[];
  activeSourceNames: string[];
  episodesDiscovered: number;
  episodesSelected: number;
  episodesDeferred: number;
  discoveryStart: string | null;
  discoveryEnd: string | null;
  youtubeMaxVideosPerCreator: number | null;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  episodes: DashboardEpisode[];
  recentEpisodes: DashboardEpisode[];
  recentInsights: SummaryInsightContext[];
  defaultPeriodLabel: string;
  defaultFromDate: string;
  defaultToDate: string;
  summaryText: string | null;
  synthesis: RunSummary | null;
  keyInsights: SummaryInsightContext[];
  supportingInsights: SummaryInsightContext[];
  splitDecisions: SummarySplitContext[];
  runFailures: DashboardRunFailure[];
  reportError: string | null;
  synthesisScopeLabel: string | null;
  synthesisIncludedCount: number;
  synthesisEligibleCount: number;
  synthesisExcludedCount: number;
  synthesisExcludedEpisodes: Array<{ episodeId: string; title: string; sourceName: string; reason: string }>;
  synthesisDistinctCreatorCount: number;
  synthesisModel: string | null;
  synthesisPromptVersion: string | null;
  synthesisAttemptError: string | null;
  synthesisStale: boolean;
  synthesisInstructionsStale: boolean;
  synthesisGeneratedAt: string | null;
  loadError: string | null;
};
