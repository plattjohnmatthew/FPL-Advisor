import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeResearchQuestion, questionSimilarity, type StoredAnalysis } from "./analysis-cache";
import type { ResearchContextMode, ResearchResponse, ResolvedResearchScope } from "./schema";

export type AnalysisLookup = { question: string; contextMode: ResearchContextMode; scope: ResolvedResearchScope; queryFingerprint: string; evidenceFingerprint: string };
export type AnalysisSave = AnalysisLookup & { response: ResearchResponse; citedInsightIds: string[]; sourceEpisodeIds: string[]; queryModel: string; answerModel: string | null };
export interface ResearchAnalysisStore { findReusable(input: AnalysisLookup): Promise<StoredAnalysis | null>; save(input: AnalysisSave): Promise<StoredAnalysis>; list(limit?: number): Promise<StoredAnalysis[]> }

export class SupabaseResearchAnalysisStore implements ResearchAnalysisStore {
  async findReusable(input: AnalysisLookup) {
    let query = createSupabaseServerClient().from("research_analyses").select("*")
      .eq("context_mode", input.contextMode).eq("scope_preset", input.scope.preset)
      .eq("query_fingerprint", input.queryFingerprint).eq("evidence_fingerprint", input.evidenceFingerprint)
      .order("created_at", { ascending: false }).limit(50);
    query = input.scope.dateFrom ? query.eq("date_from", input.scope.dateFrom) : query.is("date_from", null);
    query = input.scope.dateTo ? query.eq("date_to", input.scope.dateTo) : query.is("date_to", null);
    const { data, error } = await query; if (error) throw new Error(`Unable to search saved analyses: ${error.message}`);
    const best = data.map(fromRow).map((analysis) => ({ analysis, similarity: questionSimilarity(input.question, analysis.question) })).filter((item) => item.similarity >= 0.72).sort((a, b) => b.similarity - a.similarity || Date.parse(b.analysis.createdAt) - Date.parse(a.analysis.createdAt))[0]?.analysis ?? null;
    if (!best) return null;
    const now = new Date().toISOString(); const { error: reuseError } = await createSupabaseServerClient().from("research_analyses").update({ reuse_count: best.reuseCount + 1, last_reused_at: now }).eq("id", best.id);
    if (reuseError) throw new Error(`Unable to record saved-analysis reuse: ${reuseError.message}`);
    return { ...best, reuseCount: best.reuseCount + 1 };
  }
  async save(input: AnalysisSave) {
    const normalizedQuestion = normalizeResearchQuestion(input.question);
    const { data, error } = await createSupabaseServerClient().from("research_analyses").insert({ context_mode: input.contextMode, question: input.question, normalized_question: normalizedQuestion, scope_preset: input.scope.preset, scope_label: input.scope.label, date_from: input.scope.dateFrom, date_to: input.scope.dateTo, query_fingerprint: input.queryFingerprint, evidence_fingerprint: input.evidenceFingerprint, response_data: input.response, cited_insight_ids: input.citedInsightIds, source_episode_ids: input.sourceEpisodeIds, query_model: input.queryModel, answer_model: input.answerModel }).select("*").single();
    if (error) throw new Error(`Unable to save research analysis: ${error.message}`); return fromRow(data);
  }
  async list(limit = 100) { const { data, error } = await createSupabaseServerClient().from("research_analyses").select("*").order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 250)); if (error) throw new Error(`Unable to load saved analyses: ${error.message}`); return data.map(fromRow); }
}

function fromRow(row: Record<string, unknown>): StoredAnalysis { return { id: row.id as string, contextMode: row.context_mode as ResearchContextMode, question: row.question as string, normalizedQuestion: row.normalized_question as string, scope: { preset: row.scope_preset as ResolvedResearchScope["preset"], label: row.scope_label as string, dateFrom: row.date_from as string | null, dateTo: row.date_to as string | null }, response: row.response_data as ResearchResponse, createdAt: row.created_at as string, reuseCount: Number(row.reuse_count) }; }
