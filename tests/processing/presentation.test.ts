import assert from "node:assert/strict";
import test from "node:test";
import { emptyDashboardSnapshot } from "../../lib/dashboard/data";
import type { DashboardEpisode } from "../../lib/dashboard/types";
import { episodeActions, processingItems, processingStatus, readableFailure } from "../../lib/processing/presentation";

function episode(values: Partial<DashboardEpisode> = {}): DashboardEpisode {
  return { episodeId: "episode-1", sourceName: "Creator", title: "Episode", sourceUrl: "https://example.com/video", status: "FAILED", errorMessage: "provider raw diagnostic", retryCount: 2,
    errorStage: "TRANSCRIPT_ACQUISITION", errorRetryable: true, publishedAt: "2026-10-28T10:00:00Z", insightCount: 0, transcriptStatus: "FAILED", extractionStatus: "PENDING",
    runId: "attempt-run", attemptStartedAt: "2026-11-02T10:00:00Z", attemptCompletedAt: "2026-11-02T10:01:00Z", ...values };
}

test("operations retain unresolved episodes from older runs without duplicate rows", () => {
  const snapshot = emptyDashboardSnapshot();
  snapshot.retryableEpisodes = [episode()];
  snapshot.episodes = [episode({ status: "COMPLETED", runId: "older-run" })];
  const rows = processingItems(snapshot);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "FAILED");
  assert.equal(rows[0].runId, "attempt-run");
  assert.equal(rows[0].updatedAt, "2026-11-02T10:01:00Z");
});

test("pending and paused episodes survive later unrelated runs", () => {
  const snapshot = emptyDashboardSnapshot();
  snapshot.operationEpisodes = [episode({ status: "PAUSED" }), episode({ episodeId: "episode-2", status: "DISCOVERED", attemptStartedAt: null, attemptCompletedAt: null })];
  const rows = processingItems(snapshot);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "PAUSED");
  assert.equal(rows[1].updatedAt, null, "publication time must not masquerade as processing update time");
});

test("dismissed attempts retain their true status and retry while losing the dismiss action", () => {
  const dismissed = episode({ failureDismissedAt: "2026-11-02T10:02:00Z" });
  assert.deepEqual(episodeActions(dismissed, false, false).map((item) => item.action), ["RETRY"]);
  const snapshot = emptyDashboardSnapshot(); snapshot.episodes = [dismissed];
  assert.equal(processingItems(snapshot)[0].status, "FAILED");
  assert.equal(processingItems(snapshot)[0].errorMessage, "provider raw diagnostic");
});

test("an active run disables retry and resume but permits cooperative manual cancellation", () => {
  assert.equal(episodeActions(episode(), true, true).find((item) => item.action === "RETRY")?.disabled, true);
  assert.equal(episodeActions(episode({ status: "PAUSED" }), true, false).find((item) => item.action === "RESUME")?.disabled, true);
  for (const status of ["DISCOVERED", "TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"] as const) {
    assert.equal(episodeActions(episode({ status }), true, true).find((item) => item.action === "CANCEL")?.disabled, false);
    assert.equal(episodeActions(episode({ status }), true, false).some((item) => item.action === "CANCEL"), false);
  }
});

test("batch validation results stay separate and never pretend to be completed episodes", () => {
  const snapshot = emptyDashboardSnapshot(); snapshot.latestRunId = "batch-run";
  snapshot.batchItems = ["INVALID", "DUPLICATE", "ALREADY_PROCESSED"].map((status, index) => ({ lineNumber: index + 1, submittedUrl: "input", normalizedUrl: null, videoId: null, status, errorMessage: "diagnostic", episodeId: null, episodeTitle: null, sourceUrl: null, sourceName: null }));
  const rows = processingItems(snapshot);
  assert.deepEqual(rows.map((item) => item.status), ["INVALID", "DUPLICATE", "ALREADY_PROCESSED"]);
  assert.ok(rows.every((item) => item.episode === undefined && item.runId === "batch-run"));
  assert.equal(processingStatus("INVALID").label, "Invalid URL");
  assert.equal(processingStatus("DISCOVERED").label, "Pending");
  assert.equal(processingStatus("EXTRACTING").label, "Processing");
  assert.equal(processingStatus("COMPLETED").label, "Complete");
});

test("drawer human-readable failures do not expose provider diagnostics", () => {
  assert.match(readableFailure("TRANSCRIPT_ACQUISITION", "FAILED"), /captions or provider availability/);
  assert.match(readableFailure("EXTRACTION_PERSISTENCE", "FAILED"), /transcript is retained/i);
  assert.match(readableFailure("", "CANCELLED"), /Saved transcripts and completed work are retained/);
});
