import type { RunSummary, RunSummaryContext } from "./schema";
import type { SynthesisCacheMetadata, SynthesisIdentity } from "./cache";

export type RunSummaryGeneration = {
  cacheMetadata?: SynthesisCacheMetadata;
  summary: RunSummary;
  model: string;
  promptVersion: string;
  generatedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  synthesisMode?: "DIRECT" | "HIERARCHICAL";
  creatorBriefCount?: number;
  excludedCreators?: Array<{ sourceId: string; sourceName: string; error: string }>;
  reductionModel?: string | null;
  reductionPromptVersion?: string | null;
  reductionInputTokens?: number | null;
  reductionOutputTokens?: number | null;
};

export interface RunSummaryGenerator {
  getIdentity?(): Promise<SynthesisIdentity>;
  generate(context: RunSummaryContext, callContext?: { requestId: string }): Promise<RunSummaryGeneration>;
}
