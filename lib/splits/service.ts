import type { SplitDecisionDetector } from "./detector";
import type { SplitDecisionRepository } from "./repository";
import { SPLIT_DETECTION_VERSION } from "./prompt";
import { SplitDecisionCandidateSchema } from "./schema";
import type { SplitDetection, SplitCandidateInsight } from "./schema";

export type SplitDetectionOutcome = { persistedCount: number; warnings: string[] };

export function normalizeSplitCreatorEvidence(
  decision: SplitDetection["splitDecisions"][number],
  evidenceById: Map<string, SplitCandidateInsight>,
) {
  const positionsByCreator = new Map<string, Set<number>>();
  decision.positions.forEach((position, positionIndex) => position.supportingInsightIds.forEach((id) => {
    const sourceId = evidenceById.get(id)?.sourceId;
    if (sourceId) positionsByCreator.set(sourceId, new Set([...(positionsByCreator.get(sourceId) ?? []), positionIndex]));
  }));
  const mixedCreatorIds = new Set([...positionsByCreator].filter(([, indexes]) => indexes.size > 1).map(([sourceId]) => sourceId));
  const mixedEvidenceIds = decision.positions.flatMap((position) => position.supportingInsightIds)
    .filter((id) => mixedCreatorIds.has(evidenceById.get(id)!.sourceId))
    .sort((a, b) => evidenceById.get(a)!.publishedAt.localeCompare(evidenceById.get(b)!.publishedAt));
  const independentPositions = decision.positions.map((position) => ({
    ...position,
    supportingInsightIds: position.supportingInsightIds.filter((id) => !mixedCreatorIds.has(evidenceById.get(id)!.sourceId)),
  })).filter((position) => position.supportingInsightIds.length > 0);
  if (independentPositions.length < 2) return null;
  if (mixedEvidenceIds.length === 0) return { ...decision, positions: independentPositions };
  const names = [...new Set(mixedEvidenceIds.map((id) => evidenceById.get(id)!.sourceName))];
  return {
    ...decision,
    positions: [...independentPositions, {
      positionKey: "mixed-creator-stance",
      position: "MIXED CREATOR STANCE",
      reasoning: `${names.join(", ")} expressed competing positions during the selected period; dated evidence is retained chronologically.`,
      supportingInsightIds: mixedEvidenceIds,
    }],
  };
}

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
      let decision = parsed.data;
      const evidenceIds = decision.positions.flatMap((position) => position.supportingInsightIds);
      for (const id of evidenceIds) {
        if (!byId.has(id)) {
          warnings.push(`Discarded split candidate ${index + 1}: unknown insight ID ${id}`);
          return [];
        }
      }
      if (!evidenceIds.some((id) => newIds.has(id))) return [];
      const normalized = normalizeSplitCreatorEvidence(decision, byId);
      if (!normalized) {
        warnings.push(`Discarded split candidate ${index + 1}: competing positions lack independent creator support after mixed creator stances were aggregated`);
        return [];
      }
      decision = normalized;
      const creatorIds = new Set(decision.positions.flatMap((position) => position.supportingInsightIds).map((id) => byId.get(id)!.sourceId));
      return creatorIds.size >= 2 ? [decision] : [];
    });

    const persistedCount = await this.repository.persist(runId, newInsightIds, { ...result, splitDecisions: validDecisions });
    return { persistedCount, warnings };
  }
}
