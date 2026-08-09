import type { SplitDecisionDetector } from "./detector";
import type { SplitDecisionRepository } from "./repository";
import { SPLIT_DETECTION_VERSION } from "./prompt";
import { SplitDecisionCandidateSchema } from "./schema";

export type SplitDetectionOutcome = { persistedCount: number; warnings: string[] };

export class SplitDecisionDetectionService {
  constructor(private readonly repository: SplitDecisionRepository, private readonly detector: SplitDecisionDetector) {}

  async detectForRun(runId: string) {
    const { newInsightIds, insights } = await this.repository.loadRunContext(runId, SPLIT_DETECTION_VERSION);
    return this.detectWithContext(newInsightIds, insights, runId);
  }

  async detect(newInsightIds: string[], runId: string | null = null) {
    if (newInsightIds.length === 0) return { persistedCount: 0, warnings: [] };
    const context = await this.repository.loadRelevantInsights(newInsightIds);
    return this.detectWithContext(newInsightIds, context, runId);
  }

  private async detectWithContext(newInsightIds: string[], context: Awaited<ReturnType<SplitDecisionRepository["loadRelevantInsights"]>>, runId: string | null) {
    if (newInsightIds.length === 0) return { persistedCount: 0, warnings: [] };
    const result = await this.detector.detect(context, { runId });
    const byId = new Map(context.map((insight) => [insight.id, insight]));
    const newIds = new Set(newInsightIds);

    const warnings: string[] = [];
    const validDecisions = result.splitDecisions.flatMap((candidate, index) => {
      const parsed = SplitDecisionCandidateSchema.safeParse(candidate);
      if (!parsed.success) {
        warnings.push(`Discarded split candidate ${index + 1}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
        return [];
      }
      const decision = parsed.data;
      const evidenceIds = decision.positions.flatMap((position) => position.supportingInsightIds);
      for (const id of evidenceIds) {
        if (!byId.has(id)) {
          warnings.push(`Discarded split candidate ${index + 1}: unknown insight ID ${id}`);
          return [];
        }
      }
      if (!evidenceIds.some((id) => newIds.has(id))) return [];
      const creatorIds = new Set(evidenceIds.map((id) => byId.get(id)!.sourceId));
      return creatorIds.size >= 2 ? [decision] : [];
    });

    const persistedCount = await this.repository.persist(runId, newInsightIds, { ...result, splitDecisions: validDecisions });
    return { persistedCount, warnings };
  }
}
