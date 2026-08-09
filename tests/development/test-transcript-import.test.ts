import assert from "node:assert/strict";
import test from "node:test";

import { importTestTranscript, type TestTranscriptImportInput, type TestTranscriptImportRepository } from "../../lib/development/test-transcript-import";
import type { ExtractionResult, InsightExtractor } from "../../lib/insights/extractor";
import { EXTRACTION_VERSION } from "../../lib/insights/prompt";
import type { StoredEpisode } from "../../lib/processing/types";
import type { StoredTranscript } from "../../lib/processing/repository";

class MemoryImportRepository implements TestTranscriptImportRepository {
  readonly episode: StoredEpisode = { id: "episode-1", sourceId: "source-1", externalEpisodeId: "external-1", title: "GW3 Preview", sourceUrl: "https://example.com/gw3", publishedAt: "2026-08-07T00:00:00.000Z", durationSeconds: null, gameweek: 3 };
  transcript: StoredTranscript | null = null;
  extraction: ExtractionResult | null = null;

  async findOrCreateEpisode(input: TestTranscriptImportInput) {
    assert.equal(input.sourceName.length > 0, true);
    return { episode: this.episode, sourceCreated: this.transcript === null, episodeCreated: this.transcript === null };
  }
  async findTranscript(_episodeId: string, contentHash: string) {
    return this.transcript?.contentHash === contentHash ? { id: this.transcript.id } : null;
  }
  async saveTranscript(_episode: StoredEpisode, rawText: string, contentHash: string) {
    this.transcript = { id: "transcript-1", episodeId: this.episode.id, rawText, contentHash, language: null, segments: null };
    return { id: this.transcript.id };
  }
  async getTranscript() { return this.transcript; }
  async countExtraction(_episodeId: string, extractionVersion: string) {
    return this.extraction?.extractionVersion === extractionVersion ? 1 : 0;
  }
  async persistExtraction(_episodeId: string, extraction: ExtractionResult) {
    this.extraction = extraction;
    return extraction.insights.length;
  }
}

test("development import stores and extracts once, then reuses all records", async () => {
  const repository = new MemoryImportRepository();
  let extractionCalls = 0;
  const extraction: ExtractionResult = {
    extractionVersion: EXTRACTION_VERSION,
    promptVersion: "test-prompt",
    model: "fake-model",
    extractedAt: "2026-08-08T12:00:00.000Z",
    tokenUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    insights: [{ claim: "Buy Saka", reasoning: "Good fixtures", primaryCategory: "TRANSFER_DECISION", recommendation: "BUY", timeHorizon: "SHORT", creatorConfidence: "HIGH", entities: [], tags: ["buy"], evidenceText: "I would buy Saka", timestampSeconds: null, validFromGameweek: null, validToGameweek: null }],
  };
  const extractor: InsightExtractor = { extract: async () => { extractionCalls += 1; return extraction; } };
  const input: TestTranscriptImportInput = { sourceName: "FPL Wire", episodeTitle: "GW3 Preview", publishedAt: "2026-08-07T00:00:00.000Z", sourceUrl: "https://example.com/gw3", gameweek: 3, rawText: "I would buy Saka." };

  const first = await importTestTranscript(input, repository, extractor);
  const second = await importTestTranscript(input, repository, extractor);

  assert.equal(first.transcriptCreated, true);
  assert.equal(first.insightsCreated, 1);
  assert.equal(second.transcriptCreated, false);
  assert.equal(second.extractionSkipped, true);
  assert.equal(extractionCalls, 1);
});

test("development import rejects an empty transcript before database access", async () => {
  const repository = new MemoryImportRepository();
  await assert.rejects(importTestTranscript({ sourceName: "Source", episodeTitle: "Title", publishedAt: "2026-08-07T00:00:00.000Z", sourceUrl: "https://example.com", gameweek: null, rawText: "  " }, repository, { extract: async () => { throw new Error("should not run"); } }), /empty/);
  assert.equal(repository.transcript, null);
});
