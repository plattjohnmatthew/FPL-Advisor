import assert from "node:assert/strict";
import test from "node:test";
import { YouTubeLocalTranscriptProvider } from "../../lib/transcripts/youtube-local-provider";
import { TranscriptAcquisitionError } from "../../lib/transcripts/provider";
import type { StoredEpisode } from "../../lib/processing/types";

const episode: StoredEpisode = { id: "e1", sourceId: "s1", externalEpisodeId: "video1", title: "Episode", sourceUrl: "https://youtu.be/video1", publishedAt: "2026-08-01T00:00:00Z", durationSeconds: null, gameweek: null };
const success = JSON.stringify({ ok: true, language: "English", languageCode: "en", segments: [{ text: " Buy Saka. ", start: 1, duration: 2 }, { text: "Good fixtures.", start: 4, duration: 1.2 }] });

test("Python local provider normalizes caption text, timestamps, language and provenance", async () => {
  const provider = new YouTubeLocalTranscriptProvider({ execute: async () => ({ stdout: success, stderr: "" }) });
  const result = await provider.acquireTranscript(episode);
  assert.equal(result.providerName, "youtube_local"); assert.equal(result.rawText, "Buy Saka. Good fixtures.");
  assert.equal(result.durationSeconds, 6); assert.deepEqual(result.segments?.[0], { startSeconds: 1, endSeconds: 3, text: "Buy Saka." });
});

test("Python local provider classifies unavailable captions and request blocks", async () => {
  for (const [errorCode, category] of [["TRANSCRIPT_UNAVAILABLE", "TRANSCRIPT_UNAVAILABLE"], ["YOUTUBE_REQUEST_BLOCKED", "REQUEST_BLOCKED"]] as const) {
    const provider = new YouTubeLocalTranscriptProvider({ execute: async () => { throw Object.assign(new Error("exit"), { code: 5, stdout: JSON.stringify({ ok: false, errorCode, message: "safe failure" }), stderr: "technical" }); } });
    await assert.rejects(provider.acquireTranscript(episode), (error: unknown) => error instanceof TranscriptAcquisitionError && error.category === category);
  }
});

test("missing Python and missing package produce useful configuration errors", async () => {
  const missingPython = new YouTubeLocalTranscriptProvider({ pythonCommand: "missing", execute: async () => { throw Object.assign(new Error("spawn"), { code: "ENOENT" }); } });
  await assert.rejects(missingPython.acquireTranscript(episode), (error: unknown) => error instanceof TranscriptAcquisitionError && error.category === "PYTHON_NOT_FOUND" && error.message.includes("YOUTUBE_TRANSCRIPT_PYTHON_COMMAND"));
  const missingPackage = new YouTubeLocalTranscriptProvider({ execute: async () => { throw Object.assign(new Error("exit"), { code: 3, stdout: JSON.stringify({ ok: false, errorCode: "PACKAGE_NOT_INSTALLED", message: "Python package youtube-transcript-api is not installed." }) }); } });
  await assert.rejects(missingPackage.acquireTranscript(episode), (error: unknown) => error instanceof TranscriptAcquisitionError && error.category === "PACKAGE_NOT_INSTALLED" && error.message.includes("not installed"));
});

test("Python timeout and malformed output are bounded and understandable", async () => {
  const timeout = new YouTubeLocalTranscriptProvider({ timeoutMs: 25, execute: async () => { throw Object.assign(new Error("timed out"), { killed: true }); } });
  await assert.rejects(timeout.acquireTranscript(episode), (error: unknown) => error instanceof TranscriptAcquisitionError && error.category === "PROVIDER_UNAVAILABLE");
  const malformed = new YouTubeLocalTranscriptProvider({ execute: async () => ({ stdout: "not-json", stderr: "" }) });
  await assert.rejects(malformed.acquireTranscript(episode), (error: unknown) => error instanceof TranscriptAcquisitionError && error.category === "MALFORMED_RESPONSE");
});
