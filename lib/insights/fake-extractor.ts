import type { InsightExtractor, ExtractionResult } from "./extractor";

export class FakeInsightExtractor implements InsightExtractor {
  constructor(private readonly result: ExtractionResult = {
    model: "fake-model",
    extractionVersion: "test-v1",
    promptVersion: "test-prompt-v1",
    extractedAt: "2026-08-08T12:00:00.000Z",
    tokenUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    insights: [],
  }) {}

  async extract() {
    return this.result;
  }
}
