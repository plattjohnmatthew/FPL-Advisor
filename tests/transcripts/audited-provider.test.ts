import assert from "node:assert/strict";
import test from "node:test";
import { AuditedTranscriptProvider, type TranscriptProviderCallRecord } from "../../lib/transcripts/audited-provider";
import { TranscriptAcquisitionError, type TranscriptProvider } from "../../lib/transcripts/provider";
import type { StoredEpisode } from "../../lib/processing/types";

const episode: StoredEpisode = { id: "episode-1", sourceId: "source-1", externalEpisodeId: "video-1", title: "Episode", sourceUrl: "https://youtu.be/video-1", publishedAt: "2026-08-16T00:00:00Z", durationSeconds: null, gameweek: null };

test("records why a successful provider call happened without transcript content", async () => {
  const rows: TranscriptProviderCallRecord[] = [];
  const inner: TranscriptProvider = { acquireTranscript: async () => ({ rawText: "secret transcript text", language: "en", durationSeconds: null, providerName: "supadata", audit: { responseStatus: 200, aiFallbackAllowed: false, aiFallbackUsed: false, httpRequestCount: 1, retryAttemptCount: 0, billableRequestCount: 1 } }) };
  await new AuditedTranscriptProvider("supadata", inner, { recordTranscriptProviderCall: async (row) => { rows.push(row); } }).acquireTranscript(episode, { processingRunId: "run-1", trigger: "URL_BATCH", transcriptExistedBeforeCall: false });
  assert.equal(rows.length, 1); assert.equal(rows[0].episodeId, episode.id); assert.equal(rows[0].trigger, "URL_BATCH");
  assert.equal(rows[0].billableRequestCount, 1); assert.equal(JSON.stringify(rows[0]).includes("secret transcript text"), false);
});

test("records bounded retry metadata for failed provider acquisition", async () => {
  const rows: TranscriptProviderCallRecord[] = [];
  const failure = new TranscriptAcquisitionError("temporary failure", "TRANSIENT");
  failure.audit = { responseStatus: 503, aiFallbackAllowed: false, aiFallbackUsed: false, httpRequestCount: 3, retryAttemptCount: 2, billableRequestCount: null };
  const inner: TranscriptProvider = { acquireTranscript: async () => { throw failure; } };
  await assert.rejects(new AuditedTranscriptProvider("supadata", inner, { recordTranscriptProviderCall: async (row) => { rows.push(row); } }).acquireTranscript(episode, { processingRunId: "run-1", trigger: "AUTOMATIC_RETRY", transcriptExistedBeforeCall: false }));
  assert.equal(rows[0].success, false); assert.equal(rows[0].retryAttemptCount, 2); assert.equal(rows[0].errorKind, "TRANSIENT");
});
