import { aggregateByCreator, aggregateSentiment, buildCreatorOpinionGroups } from "@/lib/opinions/aggregation";
import type { SummaryInsightContext } from "@/lib/summaries/schema";
import type { Briefing } from "@/lib/intelligence/briefing";

export type OverviewFinding = {
  id: string; headline: string; explanation: string; category: string; label: string;
  creators: { id: string; name: string }[]; breadthLabel: string; latestEvidenceAt: string;
  entities: { id?: string; name: string; type: "PLAYER" | "TEAM" }[];
  evidence: { insightId: string; episodeId: string; episodeTitle: string; creator: string; publishedAt: string; sourceUrl: string; timestampSeconds: number | null }[];
  inYourTeam: boolean;
};
const PRIORITY: Record<string, number> = { CAPTAINCY: 9, TRANSFER_DECISION: 8, MINUTES_AVAILABILITY: 7, FIXTURES: 6, CHIPS_WILDCARD: 5, VALUE_MARKET: 4, ROLE_TEAM_CONTEXT: 3, SQUAD_STRUCTURE: 2, FORM_UNDERLYING: 1 };
const topic = (value: string) => value.toLowerCase().replaceAll("_", " ");

export function conciseExplanation(value: string) {
  const sentences = value.trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  if (sentences.length <= 420) return sentences;
  const cut = sentences.slice(0, 417); const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 300 ? lastSpace : 417)}…`;
}

function finding(headline: string, explanation: string, category: string, label: string, insights: SummaryInsightContext[], breadthLabel: string, owned: Set<string>, subject: string): OverviewFinding {
  const ordered = [...insights].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const creators = aggregateByCreator(ordered).map((creator) => ({ id: creator.sourceId, name: creator.sourceName }));
  const allEntities = [...new Map(ordered.flatMap((insight) => insight.entities).map((entity) => [entity.id ?? `${entity.type}:${entity.name}`, entity])).values()];
  const matching = allEntities.filter((entity) => subject.toLowerCase().includes(entity.name.toLowerCase()));
  const primary = allEntities.filter((entity) => /subject|target/i.test(entity.role));
  const entities = (matching.length ? matching : primary.length ? primary : ordered[0].entities).slice(0, 3);
  const countLabel = `${creators.length} distinct ${breadthLabel === "cited creator" ? "cited " : ""}creator${creators.length === 1 ? "" : "s"}${breadthLabel === "cited creator" ? "" : " discussing this topic"}`;
  return { id: `${category}:${headline}:${ordered[0].id}`, headline, explanation: conciseExplanation(explanation), category, label, creators, breadthLabel: countLabel,
    latestEvidenceAt: ordered[0].publishedAt, entities, inYourTeam: entities.some((entity) => entity.type === "PLAYER" && entity.id && owned.has(entity.id)),
    evidence: ordered.map((insight) => ({ insightId: insight.id, episodeId: insight.episodeId, episodeTitle: insight.episodeTitle, creator: insight.sourceName, publishedAt: insight.publishedAt, sourceUrl: insight.sourceUrl, timestampSeconds: insight.timestampSeconds })) };
}

function choose(candidates: OverviewFinding[]) {
  const sorted = candidates.sort((a, b) => b.creators.length - a.creators.length || (PRIORITY[b.category] ?? 0) - (PRIORITY[a.category] ?? 0) || b.latestEvidenceAt.localeCompare(a.latestEvidenceAt) || a.id.localeCompare(b.id));
  const subjects = new Set<string>(); const claims = new Set<string>();
  return sorted.filter((item) => {
    const subject = item.headline.toLocaleLowerCase(); const claim = item.explanation.toLocaleLowerCase();
    if (subjects.has(subject) || claims.has(claim)) return false;
    subjects.add(subject); claims.add(claim); return true;
  }).slice(0, 5);
}

export function findingsFromBriefing(briefing: Briefing, ownedIds: string[] = []): OverviewFinding[] {
  const owned = new Set(ownedIds); const byId = new Map(briefing.insights.map((insight) => [insight.id, insight]));
  const included = new Set(briefing.episodeIds);
  const categories: Record<string, string> = { playersToBuy: "TRANSFER_DECISION", playersToSell: "TRANSFER_DECISION", teamsToTarget: "FIXTURES", teamsToAvoid: "FIXTURES", fixtureSwings: "FIXTURES", chipStrategy: "CHIPS_WILDCARD", undervaluedPlayers: "VALUE_MARKET", overpricedPlayers: "VALUE_MARKET", mostDiscussedPlayers: "FORM_UNDERLYING", watchlist: "ROLE_TEAM_CONTEXT" };
  return choose(Object.entries(briefing.summary.sections).flatMap(([section, items]) => items.flatMap((item) => {
    const evidence = [...new Set(item.supportingInsightIds)].flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    if (!evidence.length || !evidence.some((insight) => included.has(insight.episodeId))) return [];
    const creators = aggregateByCreator(evidence); const mixed = aggregateSentiment(evidence) === "MIXED";
    const label = creators.length === 1 ? "Creator claim" : mixed ? "Mixed creator views" : item.interpretation === "CONSENSUS" ? "Consensus in cited evidence" : "Multi-creator support";
    return [finding(item.subject, item.summary, categories[section] ?? evidence[0].primaryCategory, label, evidence, "cited creator", owned, item.subject)];
  })));
}

export function findingsFromInsights(insights: SummaryInsightContext[], ownedIds: string[] = []): OverviewFinding[] {
  const byId = new Map(insights.map((insight) => [insight.id, insight])); const owned = new Set(ownedIds);
  return choose(buildCreatorOpinionGroups(insights).flatMap((group) => {
    const ids = [...new Set(group.creatorOpinions.flatMap((creator) => creator.insightIds))];
    const evidence = ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
    if (!evidence.length) return [];
    const latest = evidence[0];
    const label = aggregateSentiment(evidence) === "MIXED" ? "Mixed creator views" : "Stored creator claim";
    const headline = latest.entities.length ? `${group.subject} · ${topic(group.category)}` : group.category.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
    return [finding(headline, latest.claim, group.category, label, evidence, "creator discussing this topic", owned, group.subject)];
  }));
}
