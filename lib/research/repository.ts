import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ResearchQueryPlan, RetrievedInsight, RetrievedSplitDecision } from "./schema";

export interface ResearchRepository {
  searchInsights(plan: ResearchQueryPlan): Promise<RetrievedInsight[]>;
  searchSplits(plan: ResearchQueryPlan, insightIds: string[]): Promise<RetrievedSplitDecision[]>;
  loadInsightsByIds(insightIds: string[]): Promise<RetrievedInsight[]>;
}

export class SupabaseResearchRepository implements ResearchRepository {
  async searchInsights(plan: ResearchQueryPlan) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_fpl_insights", {
      target_player_entities: plan.playerEntities, target_team_entities: plan.teamEntities,
      target_categories: plan.categories, target_creators: plan.creators,
      target_date_from: plan.dateFrom, target_date_to: plan.dateTo ? new Date(Date.parse(plan.dateTo) - 1).toISOString() : null, target_gameweeks: plan.gameweeks,
      target_search_terms: plan.searchTerms, target_max_results: plan.maxResults,
      target_chronological: plan.chronologicalComparison, target_current_decision: plan.currentDecision,
      target_include_evidence: plan.includeTranscriptEvidence,
    });
    if (error) throw new Error(`Unable to retrieve historical insights: ${error.message}`);
    return (data as Array<Record<string, unknown>>).map((row): RetrievedInsight => ({
      id: row.insight_id as string, claim: row.claim as string, reasoning: row.reasoning as string,
      primaryCategory: row.primary_category as string, recommendation: row.recommendation as string,
      timeHorizon: row.time_horizon as string, creatorConfidence: row.creator_confidence as string,
      evidenceText: row.evidence_text as string | null, timestampSeconds: row.timestamp_seconds as number | null,
      validFromGameweek: row.valid_from_gameweek as number | null, validToGameweek: row.valid_to_gameweek as number | null,
      episodeId: row.episode_id as string, episodeTitle: row.episode_title as string, sourceUrl: row.source_url as string,
      publishedAt: row.published_at as string, gameweek: row.gameweek as number | null,
      sourceId: row.source_id as string, sourceName: row.source_name as string,
      entities: row.entities as RetrievedInsight["entities"],
    }));
  }

  async searchSplits(plan: ResearchQueryPlan, insightIds: string[]) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_fpl_split_decisions", {
      target_insight_ids: insightIds, target_search_terms: plan.searchTerms,
      target_split_focus: plan.splitFocus, target_max_results: Math.min(20, plan.maxResults),
    });
    if (error) throw new Error(`Unable to retrieve split decisions: ${error.message}`);
    return (data as Array<Record<string, unknown>>).map((row): RetrievedSplitDecision => ({
      id: row.split_decision_id as string, subject: row.subject as string, question: row.question as string,
      primaryCategory: row.primary_category as string, timeHorizon: row.time_horizon as string,
      unresolvedQuestion: row.unresolved_question as string | null, implication: row.implication as string | null,
      positions: row.positions as RetrievedSplitDecision["positions"],
    }));
  }

  async loadInsightsByIds(insightIds: string[]) {
    if (insightIds.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const { data: insights, error: insightError } = await supabase.from("insights")
      .select("id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon, creator_confidence, evidence_text, timestamp_seconds, valid_from_gameweek, valid_to_gameweek")
      .in("id", insightIds);
    if (insightError) throw new Error(`Unable to load split evidence insights: ${insightError.message}`);
    const episodeIds = [...new Set(insights.map((row) => row.episode_id as string))];
    const { data: episodes, error: episodeError } = await supabase.from("episodes")
      .select("id, source_id, title, source_url, published_at, gameweek").in("id", episodeIds);
    if (episodeError) throw new Error(`Unable to load split evidence episodes: ${episodeError.message}`);
    const sourceIds = [...new Set(episodes.map((row) => row.source_id as string))];
    const { data: sources, error: sourceError } = await supabase.from("sources").select("id, name").in("id", sourceIds);
    if (sourceError) throw new Error(`Unable to load split evidence sources: ${sourceError.message}`);
    const { data: links, error: linksError } = await supabase.from("insight_entities").select("insight_id, entity_id").in("insight_id", insightIds);
    if (linksError) throw new Error(`Unable to load split evidence entities: ${linksError.message}`);
    const entityIds = [...new Set(links.map((row) => row.entity_id as string))];
    const { data: entities, error: entityError } = entityIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("entities").select("id, canonical_name, type").in("id", entityIds);
    if (entityError) throw new Error(`Unable to load split evidence entity names: ${entityError.message}`);
    const episodeById = new Map(episodes.map((row) => [row.id as string, row]));
    const sourceById = new Map(sources.map((row) => [row.id as string, row.name as string]));
    const entityById = new Map(entities.map((row) => [row.id as string, row]));
    return insights.map((row): RetrievedInsight => {
      const episode = episodeById.get(row.episode_id as string)!;
      return {
        id: row.id as string, claim: row.claim as string, reasoning: row.reasoning as string,
        primaryCategory: row.primary_category as string, recommendation: row.recommendation as string,
        timeHorizon: row.time_horizon as string, creatorConfidence: row.creator_confidence as string,
        evidenceText: row.evidence_text as string | null, timestampSeconds: row.timestamp_seconds as number | null,
        validFromGameweek: row.valid_from_gameweek as number | null, validToGameweek: row.valid_to_gameweek as number | null,
        episodeId: episode.id as string, episodeTitle: episode.title as string, sourceUrl: episode.source_url as string,
        publishedAt: episode.published_at as string, gameweek: episode.gameweek as number | null,
        sourceId: episode.source_id as string, sourceName: sourceById.get(episode.source_id as string) ?? "Unknown source",
        entities: links.filter((link) => link.insight_id === row.id).map((link) => entityById.get(link.entity_id as string)).filter(Boolean).map((entity) => ({ name: entity!.canonical_name as string, type: entity!.type as string })),
      };
    });
  }
}
