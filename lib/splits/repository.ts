import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SplitDetectionResult } from "./detector";
import type { SplitCandidateInsight } from "./schema";

type InsightRow = {
  id: string; episode_id: string; claim: string; reasoning: string; primary_category: string;
  recommendation: string; time_horizon: string; evidence_text: string | null; created_at: string;
};

export interface SplitDecisionRepository {
  loadRunContext(runId: string, detectionVersion: string): Promise<{ newInsightIds: string[]; insights: SplitCandidateInsight[] }>;
  loadRelevantInsights(newInsightIds: string[]): Promise<SplitCandidateInsight[]>;
  persist(runId: string | null, evaluatedInsightIds: string[], result: SplitDetectionResult): Promise<number>;
}

export class SupabaseSplitDecisionRepository implements SplitDecisionRepository {
  async loadRunContext(runId: string, detectionVersion: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("load_split_detection_context", {
      target_run_id: runId,
      target_detection_version: detectionVersion,
      target_new_insight_limit: 100,
      target_context_limit: 250,
    });
    if (error) throw new Error(`Unable to load run split-decision context: ${error.message}`);
    const context = data as { newInsightIds?: unknown; insights?: unknown } | null;
    if (!context || !Array.isArray(context.newInsightIds) || !Array.isArray(context.insights)) {
      throw new Error("Unable to load run split-decision context: database returned an invalid result");
    }
    return { newInsightIds: context.newInsightIds as string[], insights: context.insights as SplitCandidateInsight[] };
  }

  async loadRelevantInsights(newInsightIds: string[]) {
    if (newInsightIds.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const { data: newInsights, error: newError } = await supabase.from("insights")
      .select("id, primary_category").in("id", newInsightIds);
    if (newError) throw new Error(`Unable to load new insight categories: ${newError.message}`);
    const categories = [...new Set(newInsights.map((row) => row.primary_category as string))];

    const { data: newLinks, error: newLinksError } = await supabase.from("insight_entities")
      .select("entity_id").in("insight_id", newInsightIds);
    if (newLinksError) throw new Error(`Unable to load new insight entities: ${newLinksError.message}`);
    const entityIds = [...new Set(newLinks.map((row) => row.entity_id as string))];
    let linkedInsightIds: string[] = [];
    if (entityIds.length > 0) {
      const { data, error } = await supabase.from("insight_entities").select("insight_id").in("entity_id", entityIds);
      if (error) throw new Error(`Unable to find entity-related insights: ${error.message}`);
      linkedInsightIds = data.map((row) => row.insight_id as string);
    }

    const { data: categoryInsights, error: categoryError } = await supabase.from("insights")
      .select("id").in("primary_category", categories);
    if (categoryError) throw new Error(`Unable to find category-related insights: ${categoryError.message}`);
    const candidateIds = [...new Set([...newInsightIds, ...linkedInsightIds, ...categoryInsights.map((row) => row.id as string)])];

    const { data: insightData, error: insightError } = await supabase.from("insights")
      .select("id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon, evidence_text, created_at")
      .in("id", candidateIds).order("created_at", { ascending: false }).limit(250);
    if (insightError) throw new Error(`Unable to load split candidate insights: ${insightError.message}`);
    const insights = insightData as InsightRow[];
    const episodeIds = [...new Set(insights.map((row) => row.episode_id))];
    const { data: episodes, error: episodesError } = await supabase.from("episodes")
      .select("id, source_id, title, published_at").in("id", episodeIds);
    if (episodesError) throw new Error(`Unable to load split candidate episodes: ${episodesError.message}`);
    const sourceIds = [...new Set(episodes.map((row) => row.source_id as string))];
    const { data: sources, error: sourcesError } = await supabase.from("sources").select("id, name").in("id", sourceIds);
    if (sourcesError) throw new Error(`Unable to load split candidate sources: ${sourcesError.message}`);

    const { data: links, error: linksError } = await supabase.from("insight_entities")
      .select("insight_id, entity_id").in("insight_id", insights.map((row) => row.id));
    if (linksError) throw new Error(`Unable to load split candidate entity links: ${linksError.message}`);
    const linkedEntityIds = [...new Set(links.map((row) => row.entity_id as string))];
    let entityNames = new Map<string, string>();
    if (linkedEntityIds.length > 0) {
      const { data, error } = await supabase.from("entities").select("id, canonical_name").in("id", linkedEntityIds);
      if (error) throw new Error(`Unable to load split candidate entities: ${error.message}`);
      entityNames = new Map(data.map((row) => [row.id as string, row.canonical_name as string]));
    }

    const episodeById = new Map(episodes.map((row) => [row.id as string, row]));
    const sourceById = new Map(sources.map((row) => [row.id as string, row.name as string]));
    return insights.map((insight): SplitCandidateInsight => {
      const episode = episodeById.get(insight.episode_id)!;
      return {
        id: insight.id, sourceId: episode.source_id as string, sourceName: sourceById.get(episode.source_id as string) ?? "Unknown source",
        episodeId: insight.episode_id, episodeTitle: episode.title as string, publishedAt: episode.published_at as string,
        claim: insight.claim, reasoning: insight.reasoning, primaryCategory: insight.primary_category,
        recommendation: insight.recommendation, timeHorizon: insight.time_horizon, evidenceText: insight.evidence_text,
        entities: links.filter((link) => link.insight_id === insight.id).map((link) => entityNames.get(link.entity_id as string)).filter((name): name is string => Boolean(name)),
      };
    });
  }

  async persist(runId: string | null, evaluatedInsightIds: string[], result: SplitDetectionResult) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("persist_split_decisions", {
      target_run_id: runId,
      target_detection_version: result.detectionVersion,
      target_prompt_version: result.promptVersion,
      target_model: result.model,
      target_detected_at: result.detectedAt,
      evaluated_insight_ids: evaluatedInsightIds,
      detected_decisions: result.splitDecisions,
    });
    if (error) throw new Error(`Unable to persist split decisions: ${error.message}`);
    return Number(data);
  }
}
