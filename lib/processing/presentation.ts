import type { DashboardEpisode, DashboardSnapshot } from "@/lib/dashboard/types";
import type { EpisodeControlAction } from "./episode-control";

export type ProcessingItem = {
  key: string; title: string; sourceName: string; sourceUrl: string | null; status: string;
  runId: string | null; updatedAt: string | null; stage: string; errorMessage: string | null;
  episode?: DashboardEpisode; batchLine?: number;
  submittedUrl?: string;
};
export function processingStatus(status: string): { label: string; tone: "neutral" | "success" | "warning" | "danger" } {
  if (status === "COMPLETED") return { label: "Complete", tone: "success" };
  if (status === "ALREADY_PROCESSED") return { label: "Already processed", tone: "success" };
  if (["TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING", "RUNNING"].includes(status)) return { label: "Processing", tone: "neutral" };
  if (status === "FAILED") return { label: "Failed", tone: "danger" };
  if (status === "INVALID") return { label: "Invalid URL", tone: "warning" };
  if (status === "PAUSED") return { label: "Paused", tone: "warning" };
  if (status === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
  if (status === "DUPLICATE") return { label: "Duplicate", tone: "neutral" };
  return { label: "Pending", tone: "neutral" };
}
export function episodeStage(episode: DashboardEpisode) {
  if (episode.errorStage) return episode.errorStage;
  if (episode.status === "COMPLETED") return "COMPLETED";
  if (episode.extractionStatus === "EXTRACTING") return "INSIGHT_EXTRACTION";
  if (episode.transcriptStatus === "FETCHING") return "TRANSCRIPT_ACQUISITION";
  return episode.status;
}
export function readableFailure(stage: string, status: string) {
  if (status === "CANCELLED") return "Processing was cancelled. Saved transcripts and completed work are retained.";
  if (stage === "TRANSCRIPT_ACQUISITION") return "The transcript could not be obtained. Check captions or provider availability, then retry.";
  if (stage === "EXTRACTION_PERSISTENCE") return "Extracted insights could not be saved. The transcript is retained; review the details before retrying.";
  if (stage.includes("EXTRACTION")) return "Insights could not be extracted. The saved transcript is retained for a retry.";
  return "This operation did not finish successfully. Review technical details before retrying.";
}
export function processingItems(snapshot: DashboardSnapshot): ProcessingItem[] {
  const episodes = new Map<string, DashboardEpisode>();
  for (const episode of snapshot.operationEpisodes ?? []) episodes.set(episode.episodeId, episode);
  for (const episode of snapshot.retryableEpisodes) episodes.set(episode.episodeId, episode);
  for (const episode of snapshot.episodes) if (!episodes.has(episode.episodeId)) episodes.set(episode.episodeId, episode);
  // The latest run can contain an older attempt: authoritative latest-attempt failures win.
  const batchEpisodeIds = new Set(snapshot.batchItems.flatMap((item) => item.episodeId ? [item.episodeId] : []));
  const items: ProcessingItem[] = [...episodes.values()].filter((episode) => !batchEpisodeIds.has(episode.episodeId)).map((episode) => ({
    key: `episode-${episode.episodeId}`, title: episode.title, sourceName: episode.sourceName, sourceUrl: episode.sourceUrl,
    status: episode.status, runId: episode.runId ?? null, updatedAt: episode.attemptCompletedAt ?? episode.attemptStartedAt ?? null,
    stage: episodeStage(episode), errorMessage: episode.errorMessage, episode,
  }));
  for (const item of snapshot.batchItems) {
    const episode = item.episodeId ? episodes.get(item.episodeId) : undefined;
    const hasOwnOutcome = ["DUPLICATE", "INVALID", "ALREADY_PROCESSED"].includes(item.status);
    items.push({ key: `batch-${item.lineNumber}`, title: item.episodeTitle ?? item.normalizedUrl ?? item.submittedUrl,
      sourceName: item.sourceName ?? "Submitted URL", sourceUrl: item.sourceUrl ?? item.normalizedUrl,
      status: !hasOwnOutcome && episode ? episode.status : item.status, runId: episode?.runId ?? snapshot.latestRunId,
      updatedAt: episode?.attemptCompletedAt ?? episode?.attemptStartedAt ?? item.updatedAt ?? null,
      stage: episode ? episodeStage(episode) : "URL_VALIDATION", errorMessage: item.errorMessage ?? episode?.errorMessage ?? null,
      episode: hasOwnOutcome ? undefined : episode, batchLine: item.lineNumber, submittedUrl: item.submittedUrl });
  }
  for (const [index, failure] of snapshot.runFailures.entries()) items.push({ key: `run-${index}`, title: "Run-level issue", sourceName: "Processing run", sourceUrl: null,
    status: "FAILED", runId: snapshot.latestRunId, updatedAt: failure.occurredAt, stage: failure.stage, errorMessage: failure.errorMessage });
  return items;
}
export function episodeActions(episode: DashboardEpisode, runActive: boolean, manualRun: boolean): { action: EpisodeControlAction; label: string; disabled: boolean }[] {
  const result: { action: EpisodeControlAction; label: string; disabled: boolean }[] = [];
  if (["FAILED", "CANCELLED"].includes(episode.status)) {
    result.push({ action: "RETRY", label: "Retry", disabled: runActive });
    if (!episode.failureDismissedAt) result.push({ action: "DISMISS", label: "Dismiss failure", disabled: false });
  }
  if (episode.status === "PAUSED") result.push({ action: "RESUME", label: "Resume", disabled: runActive });
  if (episode.status === "DISCOVERED" && !runActive) result.push({ action: "RETRY", label: "Process now", disabled: false });
  if (runActive && manualRun && ["DISCOVERED", "TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"].includes(episode.status)) result.push({ action: "CANCEL", label: "Cancel retry", disabled: false });
  if (["DISCOVERED", "TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"].includes(episode.status)) result.push({ action: "PAUSE", label: "Pause after safe step", disabled: false });
  return result;
}
