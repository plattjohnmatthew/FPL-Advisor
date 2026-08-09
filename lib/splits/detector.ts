import type { SplitCandidateInsight, SplitDetection } from "./schema";

export type SplitDetectionResult = SplitDetection & {
  model: string;
  detectionVersion: string;
  promptVersion: string;
  detectedAt: string;
};

export interface SplitDecisionDetector {
  detect(insights: SplitCandidateInsight[], context?: { runId: string | null; requestId?: string }): Promise<SplitDetectionResult>;
}
