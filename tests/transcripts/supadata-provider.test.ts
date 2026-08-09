import assert from "node:assert/strict";
import test from "node:test";

import type { StoredEpisode } from "../../lib/processing/types";
import { TranscriptAcquisitionError } from "../../lib/transcripts/provider";
import { SupadataTranscriptProvider } from "../../lib/transcripts/supadata-provider";

const episode: StoredEpisode = {
  id: "episode-1", sourceId: "source-1", externalEpisodeId: "video-1", title: "Real episode",
  sourceUrl: "https://www.youtube.com/watch?v=video-1", publishedAt: "2026-08-08T12:00:00.000Z",
  durationSeconds: null, gameweek: null,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const options = (fetcher: typeof fetch) => ({
  fetcher, sleep: async () => {}, retryDelayMs: 0, jobPollIntervalMs: 0,
});

test("normalizes a successful plain-text Supadata transcript", async () => {
  const provider = new SupadataTranscriptProvider("secret", options(async () => json({ content: "  Useful FPL view.  ", lang: "en" })));
  assert.deepEqual(await provider.acquireTranscript(episode), {
    rawText: "Useful FPL view.", language: "en", durationSeconds: null, providerName: "supadata",
  });
});

test("normalizes timestamped Supadata segments and derives duration", async () => {
  const provider = new SupadataTranscriptProvider("secret", options(async () => json({
    lang: "en", content: [
      { text: "Buy Watkins.", offset: 1000, duration: 2000, lang: "en" },
      { text: "Great fixtures.", offset: 4000, duration: 1500, lang: "en" },
    ],
  })));
  assert.deepEqual(await provider.acquireTranscript(episode), {
    rawText: "Buy Watkins. Great fixtures.", language: "en", durationSeconds: 6, providerName: "supadata",
    segments: [
      { startSeconds: 1, endSeconds: 3, text: "Buy Watkins." },
      { startSeconds: 4, endSeconds: 5.5, text: "Great fixtures." },
    ],
  });
});

test("maps transcript unavailable and invalid videos to permanent failures", async () => {
  for (const [status, message] of [[206, "No transcript"], [400, "Unsupported URL"]] as const) {
    const provider = new SupadataTranscriptProvider("secret", options(async () => json({ message }, status)));
    await assert.rejects(provider.acquireTranscript(episode), (error: unknown) =>
      error instanceof TranscriptAcquisitionError && error.kind === "PERMANENT" && error.message.includes(message));
  }
});

test("retries a rate limit and succeeds without exposing the API key", async () => {
  let calls = 0;
  const provider = new SupadataTranscriptProvider("top-secret", options(async (_url, init) => {
    calls += 1;
    assert.equal(new Headers(init?.headers).get("x-api-key"), "top-secret");
    return calls === 1 ? json({ message: "Slow down" }, 429) : json({ content: "Recovered", lang: "en" });
  }));
  assert.equal((await provider.acquireTranscript(episode)).rawText, "Recovered");
  assert.equal(calls, 2);
});

test("reports a transient failure after bounded retries are exhausted", async () => {
  let calls = 0;
  const provider = new SupadataTranscriptProvider("secret", {
    ...options(async () => { calls += 1; return json({ message: "Unavailable" }, 503); }), maxRequestAttempts: 3,
  });
  await assert.rejects(provider.acquireTranscript(episode), (error: unknown) =>
    error instanceof TranscriptAcquisitionError && error.kind === "TRANSIENT" && /503/.test(error.message));
  assert.equal(calls, 3);
});

test("rejects malformed provider responses", async () => {
  const provider = new SupadataTranscriptProvider("secret", options(async () => json({ unexpected: true })));
  await assert.rejects(provider.acquireTranscript(episode), /did not contain transcript content/);
});

test("polls an asynchronous Supadata job and normalizes its result", async () => {
  const responses = [json({ jobId: "job-1" }, 202), json({ status: "active" }), json({ status: "completed", content: "Done", lang: "en" })];
  const provider = new SupadataTranscriptProvider("secret", options(async () => responses.shift()!));
  assert.equal((await provider.acquireTranscript(episode)).rawText, "Done");
  assert.equal(responses.length, 0);
});
