import type { SplitDecisionDetector, SplitDetectionResult } from "./detector";

export class FakeSplitDecisionDetector implements SplitDecisionDetector {
  constructor(private readonly result: SplitDetectionResult = {
    splitDecisions: [], model: "fake-model", detectionVersion: "test-v1",
    promptVersion: "test-prompt-v1", detectedAt: "2026-08-08T12:00:00.000Z",
  }) {}
  async detect() { return this.result; }
}
