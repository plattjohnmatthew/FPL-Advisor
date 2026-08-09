import type { RunSummaryGeneration, RunSummaryGenerator } from "./generator";

export class FakeRunSummaryGenerator implements RunSummaryGenerator {
  constructor(private readonly generation: RunSummaryGeneration) {}
  async generate() { return this.generation; }
}
