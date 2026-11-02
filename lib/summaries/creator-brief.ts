import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunSummaryContext, SummaryInsightContext } from "./schema";
import { estimateTokens } from "./token-budget";

export const CREATOR_BRIEF_PROMPT_VERSION = "creator-brief-v1";

export const CreatorPositionSchema = z.object({
  clusterKey: z.string().min(1), subject: z.string().min(1), entityIds: z.array(z.string()), category: z.string().min(1),
  recommendation: z.string().min(1), timeHorizon: z.string().min(1), stance: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"]),
  claim: z.string().min(1), reasoning: z.array(z.string().min(1)).max(6), evidenceInsightIds: z.array(z.string().uuid()).min(1),
  episodeIds: z.array(z.string().uuid()).min(1), latestPublishedAt: z.string().min(1), previousStance: z.string().nullable(), changedAt: z.string().nullable(),
});
export const CreatorBriefSchema = z.object({
  creatorId: z.string().uuid(), creatorName: z.string().min(1), scope: z.object({ from: z.string(), to: z.string() }),
  positions: z.array(CreatorPositionSchema).min(1),
});
export type CreatorBrief = z.infer<typeof CreatorBriefSchema>;

export function createCreatorBriefOutputSchema(insightIds: string[], episodeIds: string[]) {
  if (insightIds.length === 0 || episodeIds.length === 0) throw new Error("Creator reduction requires insight and episode evidence IDs.");
  const position = CreatorPositionSchema.extend({
    evidenceInsightIds: z.array(z.enum(insightIds as [string, ...string[]])).min(1),
    episodeIds: z.array(z.enum(episodeIds as [string, ...string[]])).min(1),
  });
  return CreatorBriefSchema.extend({ positions: z.array(position).min(1) });
}

export function insightClusterKey(insight: SummaryInsightContext) {
  const entities = insight.entities.map((entity) => entity.id ?? `${entity.type}:${entity.name.toLowerCase()}`).sort().join(",") || "no-entity";
  return [entities, insight.primaryCategory, insight.recommendation, insight.timeHorizon].join("|");
}

export function normalizeCreatorInsights(insights: SummaryInsightContext[]) {
  const seen = new Set<string>();
  return [...insights].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id)).filter((insight) => {
    const key = `${insight.id}|${insightClusterKey(insight)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function creatorBriefInputHash(insights: SummaryInsightContext[]) {
  return createHash("sha256").update(JSON.stringify(normalizeCreatorInsights(insights))).digest("hex");
}

export function chunkCreatorInsights(insights: SummaryInsightContext[], maximumTokens: number, fixedTokens = 0) {
  const groups = new Map<string, SummaryInsightContext[]>();
  for (const insight of normalizeCreatorInsights(insights)) {
    const key = insightClusterKey(insight); groups.set(key, [...(groups.get(key) ?? []), insight]);
  }
  const tokenById = new Map(normalizeCreatorInsights(insights).map((item) => [item.id, estimateTokens(item) + 4]));
  const groupTokens = (group: SummaryInsightContext[]) => group.reduce((total, item) => total + tokenById.get(item.id)!, 2);
  const atomicGroups = [...groups.values()].flatMap((group) => {
    if (groupTokens(group) + fixedTokens <= maximumTokens) return [group];
    const chunks: SummaryInsightContext[][] = []; let current: SummaryInsightContext[] = [];
    let currentTokens = fixedTokens + 2;
    for (const insight of group) {
      const tokens = tokenById.get(insight.id)!;
      if (current.length > 0 && currentTokens + tokens > maximumTokens) { chunks.push(current); current = []; currentTokens = fixedTokens + 2; }
      if (tokens + fixedTokens > maximumTokens) throw new Error(`One structured insight is too large for creator reduction: ${insight.id}`);
      current.push(insight); currentTokens += tokens;
    }
    if (current.length) chunks.push(current); return chunks;
  });
  const chunks: SummaryInsightContext[][] = []; let current: SummaryInsightContext[] = []; let currentTokens = fixedTokens + 2;
  for (const group of atomicGroups) {
    const tokens = groupTokens(group);
    if (current.length > 0 && currentTokens + tokens > maximumTokens) { chunks.push(current); current = []; currentTokens = fixedTokens + 2; }
    current.push(...group); currentTokens += tokens;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function mergeCreatorBriefs(briefs: CreatorBrief[]): CreatorBrief {
  if (briefs.length === 0) throw new Error("Cannot merge an empty creator brief set.");
  const positions = new Map<string, CreatorBrief["positions"][number]>();
  for (const brief of briefs) for (const position of brief.positions) {
    const decisionKey = [position.entityIds.slice().sort().join(",") || position.subject.toLowerCase(), position.category, position.timeHorizon].join("|");
    const existing = positions.get(decisionKey);
    if (!existing) { positions.set(decisionKey, structuredClone(position)); continue; }
    const newer = position.latestPublishedAt > existing.latestPublishedAt ? position : existing;
    positions.set(decisionKey, {
      ...newer,
      evidenceInsightIds: [...new Set([...existing.evidenceInsightIds, ...position.evidenceInsightIds])],
      episodeIds: [...new Set([...existing.episodeIds, ...position.episodeIds])],
      reasoning: [...new Set([...existing.reasoning, ...position.reasoning])].slice(0, 6),
      stance: existing.stance === position.stance ? existing.stance : "MIXED",
      previousStance: existing.stance === position.stance ? newer.previousStance : existing.stance,
      changedAt: existing.stance === position.stance ? newer.changedAt : newer.latestPublishedAt,
    });
  }
  return { ...briefs[0], positions: [...positions.values()] };
}

export function synthesisScopeBounds(scope: RunSummaryContext["scope"]) {
  return scope.type === "DATE_RANGE" ? { from: scope.fromDate, to: scope.toDate } : { from: "run", to: "run" };
}
