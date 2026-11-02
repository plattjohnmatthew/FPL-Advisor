import assert from "node:assert/strict";
import test from "node:test";
import { TranscriptProviderChain } from "../../lib/transcripts/provider-chain";
import { TranscriptAcquisitionError, type TranscriptProvider } from "../../lib/transcripts/provider";
import type { StoredEpisode } from "../../lib/processing/types";

const episode: StoredEpisode = { id: "e1", sourceId: "s1", externalEpisodeId: "v1", title: "E", sourceUrl: "https://youtu.be/v1", publishedAt: "2026-08-01T00:00:00Z", durationSeconds: null, gameweek: null };
const result = (providerName: string) => ({ rawText: "text", language: "en", durationSeconds: 1, providerName });
const context = { processingRunId: "r1", trigger: "URL_BATCH" as const, transcriptExistedBeforeCall: false };

test("primary success never calls fallback", async () => {
  let fallbackCalls = 0;
  const primary: TranscriptProvider = { acquireTranscript: async () => result("supadata") };
  const fallback: TranscriptProvider = { acquireTranscript: async () => { fallbackCalls += 1; return result("youtube_local"); } };
  assert.equal((await new TranscriptProviderChain("supadata", primary, "youtube_local", fallback, { recordTranscriptProviderCall: async () => {} }).acquireTranscript(episode, context)).providerName, "supadata");
  assert.equal(fallbackCalls, 0);
});

test("quota failure invokes fallback once and records the reason", async () => {
  let fallbackCalls = 0; const marks: string[] = [];
  const primary: TranscriptProvider = { acquireTranscript: async () => { throw new TranscriptAcquisitionError("credits", "PERMANENT", "QUOTA_EXHAUSTED"); } };
  const fallback: TranscriptProvider = { acquireTranscript: async (_episode, received) => { fallbackCalls += 1; assert.equal(received?.providerRole, "FALLBACK"); return result("youtube_local"); } };
  const recorder = { recordTranscriptProviderCall: async () => {}, markTranscriptProviderFallbackUsed: async ({ fallbackReason }: { fallbackReason: string }) => { marks.push(fallbackReason); } };
  assert.equal((await new TranscriptProviderChain("supadata", primary, "youtube_local", fallback, recorder).acquireTranscript(episode, context)).providerName, "youtube_local");
  assert.equal(fallbackCalls, 1); assert.deepEqual(marks, ["QUOTA_EXHAUSTED"]);
});

test("invalid video and unavailable captions do not invoke fallback", async () => {
  for (const category of ["INVALID_REQUEST", "TRANSCRIPT_UNAVAILABLE"] as const) {
    let fallbackCalls = 0;
    const primary: TranscriptProvider = { acquireTranscript: async () => { throw new TranscriptAcquisitionError("bad", "PERMANENT", category); } };
    const fallback: TranscriptProvider = { acquireTranscript: async () => { fallbackCalls += 1; return result("youtube_local"); } };
    await assert.rejects(new TranscriptProviderChain("supadata", primary, "youtube_local", fallback, { recordTranscriptProviderCall: async () => {} }).acquireTranscript(episode, context));
    assert.equal(fallbackCalls, 0);
  }
});

test("both providers failing stops after one fallback and preserves fallback category", async () => {
  let primaryCalls = 0; let fallbackCalls = 0;
  const primary: TranscriptProvider = { acquireTranscript: async () => { primaryCalls += 1; throw new TranscriptAcquisitionError("rate", "TRANSIENT", "RATE_LIMITED"); } };
  const fallback: TranscriptProvider = { acquireTranscript: async () => { fallbackCalls += 1; throw new TranscriptAcquisitionError("blocked", "PERMANENT", "REQUEST_BLOCKED"); } };
  await assert.rejects(new TranscriptProviderChain("supadata", primary, "youtube_local", fallback, { recordTranscriptProviderCall: async () => {} }).acquireTranscript(episode, context), (error: unknown) => error instanceof TranscriptAcquisitionError && error.category === "REQUEST_BLOCKED");
  assert.equal(primaryCalls, 1); assert.equal(fallbackCalls, 1);
});
