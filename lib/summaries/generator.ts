import type { RunSummary, RunSummaryContext } from "./schema";

export type RunSummaryGeneration = {
  summary: RunSummary;
  model: string;
  promptVersion: string;
  generatedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export interface RunSummaryGenerator {
  generate(context: RunSummaryContext, callContext?: { requestId: string }): Promise<RunSummaryGeneration>;
}
