import assert from "node:assert/strict";
import test from "node:test";

import { ManualTranscriptProvider } from "../../lib/transcripts/manual-provider";
import type { StoredEpisode } from "../../lib/processing/types";

const episode: StoredEpisode = {
  id: "episode-1",
  sourceId: "source-1",
  externalEpisodeId: "external-1",
  title: "Test episode",
  sourceUrl: "https://example.com/episode",
  publishedAt: "2026-08-08T12:00:00.000Z",
  durationSeconds: null,
  gameweek: null,
};

test("manual transcript provider normalizes optional metadata", async () => {
  const provider = new ManualTranscriptProvider(async () => ({
    rawText: "  Useful transcript text.  ",
    language: " en ",
    durationSeconds: 123,
    segments: [{ startSeconds: 0, text: "Useful transcript text." }],
  }));

  assert.deepEqual(await provider.acquireTranscript(episode), {
    rawText: "Useful transcript text.",
    language: "en",
    durationSeconds: 123,
    providerName: "manual",
    segments: [{ startSeconds: 0, text: "Useful transcript text." }],
  });
});

test("manual transcript provider explains when no transcript is available", async () => {
  const provider = new ManualTranscriptProvider(async () => null);
  await assert.rejects(provider.acquireTranscript(episode), /Paste a transcript, then retry processing/);
});
