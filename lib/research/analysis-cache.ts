import { createHash } from "node:crypto";
import type { ResearchContextMode, ResearchQueryPlan, ResearchResponse, ResolvedResearchScope, RetrievedInsight, RetrievedSplitDecision } from "./schema";

export function normalizeResearchQuestion(question: string) {
  return question.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function queryFingerprint(plan: ResearchQueryPlan) {
  return digest({ players: [...plan.playerEntities].sort(), teams: [...plan.teamEntities].sort(), categories: [...plan.categories].sort(), creators: [...plan.creators].sort(), gameweeks: [...plan.gameweeks].sort((a, b) => a - b), chronological: plan.chronologicalComparison, current: plan.currentDecision, splits: plan.splitFocus });
}

export function evidenceFingerprint(insights: RetrievedInsight[], splits: RetrievedSplitDecision[]) {
  return digest({ insights: insights.map((item) => item.id).sort(), splits: splits.map((split) => ({ id: split.id, question: split.question, positions: split.positions.map((position) => ({ id: position.positionId, position: position.position, reasoning: position.reasoning, insightIds: [...position.supportingInsightIds].sort() })).sort((a, b) => a.id.localeCompare(b.id)) })).sort((a, b) => a.id.localeCompare(b.id)) });
}

function bigrams(value: string) { const padded = ` ${value} `; return Array.from({ length: Math.max(0, padded.length - 1) }, (_, index) => padded.slice(index, index + 2)); }
export function questionSimilarity(left: string, right: string) {
  const a = bigrams(normalizeResearchQuestion(left)); const b = bigrams(normalizeResearchQuestion(right));
  if (!a.length || !b.length) return 0;
  const counts = new Map<string, number>(); for (const item of a) counts.set(item, (counts.get(item) ?? 0) + 1);
  let overlap = 0; for (const item of b) { const count = counts.get(item) ?? 0; if (count > 0) { overlap += 1; counts.set(item, count - 1); } }
  return (2 * overlap) / (a.length + b.length);
}

export type StoredAnalysis = { id: string; contextMode: ResearchContextMode; question: string; normalizedQuestion: string; scope: ResolvedResearchScope; response: ResearchResponse; createdAt: string; reuseCount: number };
