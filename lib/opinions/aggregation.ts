export type OpinionInsight = {
  id: string;
  sourceId: string;
  sourceName: string;
  episodeId: string;
  publishedAt: string;
  recommendation: string;
  primaryCategory: string;
  timeHorizon: string;
  entities: Array<{ name: string; type?: string }> | string[];
};

export type CreatorStance = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";

export type CreatorOpinion = {
  sourceId: string;
  sourceName: string;
  stance: CreatorStance;
  insightIds: string[];
  episodeIds: string[];
  chronology: Array<{ insightId: string; episodeId: string; publishedAt: string; stance: Exclude<CreatorStance, "MIXED"> }>;
};

const POSITIVE = new Set(["BUY", "HOLD", "CAPTAIN", "START"]);
const NEGATIVE = new Set(["SELL", "AVOID", "BENCH"]);

export function recommendationStance(recommendation: string): Exclude<CreatorStance, "MIXED"> {
  if (POSITIVE.has(recommendation)) return "POSITIVE";
  if (NEGATIVE.has(recommendation)) return "NEGATIVE";
  return "NEUTRAL";
}

export function aggregateByCreator(insights: OpinionInsight[]): CreatorOpinion[] {
  const bySource = new Map<string, OpinionInsight[]>();
  for (const insight of insights) bySource.set(insight.sourceId, [...(bySource.get(insight.sourceId) ?? []), insight]);
  return [...bySource.values()].map((items) => {
    const chronological = [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
    const chronology = chronological.map((item) => ({ insightId: item.id, episodeId: item.episodeId, publishedAt: item.publishedAt, stance: recommendationStance(item.recommendation) }));
    const directional = new Set(chronology.map((item) => item.stance).filter((stance) => stance !== "NEUTRAL"));
    const stance: CreatorStance = directional.size > 1 ? "MIXED" : directional.values().next().value ?? "NEUTRAL";
    return {
      sourceId: chronological[0].sourceId,
      sourceName: chronological[0].sourceName,
      stance,
      insightIds: chronological.map((item) => item.id),
      episodeIds: [...new Set(chronological.map((item) => item.episodeId))],
      chronology,
    };
  }).sort((a, b) => a.sourceName.localeCompare(b.sourceName));
}

function entityNames(insight: OpinionInsight) {
  return insight.entities.map((entity) => typeof entity === "string" ? entity : entity.name).filter(Boolean);
}

export function buildCreatorOpinionGroups(insights: OpinionInsight[]) {
  const groups = new Map<string, { subject: string; category: string; timeHorizon: string; insights: OpinionInsight[] }>();
  for (const insight of insights) {
    const subjects = [...new Set(entityNames(insight))];
    for (const subject of subjects.length > 0 ? subjects : [insight.primaryCategory]) {
      const key = `${subject.toLowerCase()}|${insight.primaryCategory}|${insight.timeHorizon}`;
      const group = groups.get(key) ?? { subject, category: insight.primaryCategory, timeHorizon: insight.timeHorizon, insights: [] };
      group.insights.push(insight); groups.set(key, group);
    }
  }
  return [...groups.values()].map((group) => ({
    subject: group.subject,
    category: group.category,
    timeHorizon: group.timeHorizon,
    attention: {
      insightCount: group.insights.length,
      episodeCount: new Set(group.insights.map((item) => item.episodeId)).size,
      creatorCount: new Set(group.insights.map((item) => item.sourceId)).size,
    },
    creatorOpinions: aggregateByCreator(group.insights),
  }));
}

export function calculateSubjectAttention(subject: string, insights: OpinionInsight[], fallbackInsights: OpinionInsight[] = insights) {
  const normalized = subject.trim().toLowerCase();
  const matching = insights.filter((insight) => entityNames(insight).some((name) => {
    const entity = name.toLowerCase();
    return entity === normalized || entity.includes(normalized) || normalized.includes(entity);
  }));
  const evidence = matching.length > 0 ? matching : fallbackInsights;
  return {
    insightCount: evidence.length,
    episodeCount: new Set(evidence.map((item) => item.episodeId)).size,
    creatorCount: new Set(evidence.map((item) => item.sourceId)).size,
  };
}

export function aggregateSentiment(insights: OpinionInsight[]): CreatorStance {
  const stances = new Set(aggregateByCreator(insights).map((opinion) => opinion.stance));
  if (stances.has("MIXED") || (stances.has("POSITIVE") && stances.has("NEGATIVE"))) return "MIXED";
  if (stances.has("POSITIVE")) return "POSITIVE";
  if (stances.has("NEGATIVE")) return "NEGATIVE";
  return "NEUTRAL";
}
