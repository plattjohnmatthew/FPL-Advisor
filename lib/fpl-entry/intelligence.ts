import "server-only";

import { aggregateByCreator, aggregateSentiment, type CreatorStance } from "@/lib/opinions/aggregation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CurrentSquadContextService, type CurrentSquadContext, type SquadContextPlayer } from "./context";

export type SquadPlayerStatus = CreatorStance | "NO_RECENT_COVERAGE";
export type SquadIntelligenceInsight = {
  id: string; entityId: string; playerName: string; sourceId: string; sourceName: string;
  episodeId: string; episodeTitle: string; sourceUrl: string; publishedAt: string;
  claim: string; reasoning: string; recommendation: string; primaryCategory: string;
  timeHorizon: string; timestampSeconds: number | null; evidenceText: string | null;
  entities: Array<{ name: string; type: string }>;
};
export type SquadPlayerIntelligence = {
  player: SquadContextPlayer; status: SquadPlayerStatus; creatorCount: number;
  insightCount: number; insights: SquadIntelligenceInsight[];
};
export type SquadIntelligence = {
  context: CurrentSquadContext;
  fromDate: string;
  players: SquadPlayerIntelligence[];
  recommended: SquadPlayerIntelligence[];
  questioned: SquadPlayerIntelligence[];
  risks: SquadIntelligenceInsight[];
  captaincy: SquadIntelligenceInsight[];
  mostDiscussed: SquadPlayerIntelligence[];
  noCoverage: SquadPlayerIntelligence[];
  splitQuestions: string[];
};

export class SquadIntelligenceService {
  constructor(private readonly contexts = new CurrentSquadContextService()) {}

  async load(days = 14, now = new Date()): Promise<SquadIntelligence | null> {
    const context = await this.contexts.getCurrent();
    if (!context) return null;
    const from = new Date(now); from.setUTCDate(from.getUTCDate() - (days - 1)); from.setUTCHours(0, 0, 0, 0);
    const insights = await loadSquadInsights(context, from.toISOString());
    return buildSquadIntelligence(context, insights, await loadSplitQuestions(insights.map((item) => item.id)), from.toISOString());
  }
}

export function buildSquadIntelligence(context: CurrentSquadContext, insights: SquadIntelligenceInsight[], splitQuestions: string[], fromDate: string): SquadIntelligence {
  const ownedEntityIds = new Set(context.entityIds);
  const relevant = insights.filter((insight) => ownedEntityIds.has(insight.entityId));
  const byEntity = new Map<string, SquadIntelligenceInsight[]>();
  for (const insight of relevant) byEntity.set(insight.entityId, [...(byEntity.get(insight.entityId) ?? []), insight]);
  const players = context.players.map((player): SquadPlayerIntelligence => {
    const items = player.entityId ? byEntity.get(player.entityId) ?? [] : [];
    return { player, status: items.length ? aggregateSentiment(items) : "NO_RECENT_COVERAGE", creatorCount: aggregateByCreator(items).length, insightCount: items.length, insights: items };
  });
  const risks = relevant.filter((item) => item.primaryCategory === "MINUTES_AVAILABILITY" || ["SELL", "AVOID", "BENCH", "WATCH"].includes(item.recommendation));
  const captaincy = relevant.filter((item) => item.primaryCategory === "CAPTAINCY" || item.recommendation === "CAPTAIN");
  return { context, fromDate, players, recommended: players.filter((item) => item.status === "POSITIVE").sort(byBreadth), questioned: players.filter((item) => item.status === "NEGATIVE" || item.status === "MIXED").sort(byBreadth), risks: newest(risks), captaincy: newest(captaincy), mostDiscussed: players.filter((item) => item.insightCount > 0).sort(byBreadth).slice(0, 5), noCoverage: players.filter((item) => item.status === "NO_RECENT_COVERAGE"), splitQuestions };
}

function byBreadth(a: SquadPlayerIntelligence, b: SquadPlayerIntelligence) {
  return b.creatorCount - a.creatorCount || b.insightCount - a.insightCount || a.player.webName.localeCompare(b.player.webName);
}
function newest(items: SquadIntelligenceInsight[]) { return [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 8); }

async function loadSquadInsights(context: CurrentSquadContext, fromDate: string): Promise<SquadIntelligenceInsight[]> {
  if (!context.entityIds.length) return [];
  const { data, error } = await createSupabaseServerClient().from("insight_entities")
    .select("entity_id, insights!inner(id,claim,reasoning,primary_category,recommendation,time_horizon,evidence_text,timestamp_seconds,episodes!inner(id,title,source_url,published_at,source_id,sources!inner(id,name)))")
    .in("entity_id", context.entityIds).gte("insights.episodes.published_at", fromDate);
  if (error) throw new Error(`Could not load recent My Team intelligence: ${error.message}`);
  const playerByEntity = new Map(context.players.flatMap((player) => player.entityId ? [[player.entityId, player]] as const : []));
  return (data ?? []).flatMap((row) => {
    const insight = Array.isArray(row.insights) ? row.insights[0] : row.insights; if (!insight) return [];
    const episode = Array.isArray(insight.episodes) ? insight.episodes[0] : insight.episodes; if (!episode) return [];
    const source = Array.isArray(episode.sources) ? episode.sources[0] : episode.sources; if (!source) return [];
    const player = playerByEntity.get(row.entity_id as string); if (!player) return [];
    return [{ id: insight.id as string, entityId: row.entity_id as string, playerName: player.playerName,
      sourceId: source.id as string, sourceName: source.name as string, episodeId: episode.id as string,
      episodeTitle: episode.title as string, sourceUrl: episode.source_url as string, publishedAt: episode.published_at as string,
      claim: insight.claim as string, reasoning: insight.reasoning as string, recommendation: insight.recommendation as string,
      primaryCategory: insight.primary_category as string, timeHorizon: insight.time_horizon as string,
      timestampSeconds: insight.timestamp_seconds as number | null, evidenceText: insight.evidence_text as string | null,
      entities: [{ name: player.playerName, type: "PLAYER" }] }];
  });
}

async function loadSplitQuestions(insightIds: string[]) {
  if (!insightIds.length) return [];
  const { data, error } = await createSupabaseServerClient().from("split_position_insights")
    .select("split_positions(split_decisions(question))").in("insight_id", insightIds);
  if (error) throw new Error(`Could not load My Team split decisions: ${error.message}`);
  return [...new Set((data ?? []).flatMap((row) => {
    const position = Array.isArray(row.split_positions) ? row.split_positions[0] : row.split_positions;
    const decision = position && (Array.isArray(position.split_decisions) ? position.split_decisions[0] : position.split_decisions);
    return decision?.question ? [decision.question as string] : [];
  }))];
}
