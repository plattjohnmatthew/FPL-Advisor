import { z } from "zod";
import { PRIMARY_CATEGORIES } from "@/lib/insights/schema";

export const ResearchQueryPlanSchema = z.object({
  playerEntities: z.array(z.string().trim().min(1)), teamEntities: z.array(z.string().trim().min(1)),
  categories: z.array(z.enum(PRIMARY_CATEGORIES)), creators: z.array(z.string().trim().min(1)),
  dateFrom: z.string().trim().min(4).nullable(), dateTo: z.string().trim().min(4).nullable(),
  gameweeks: z.array(z.number().int().min(1).max(38)), searchTerms: z.array(z.string().trim().min(2)),
  maxResults: z.number().int().min(5).max(100), chronologicalComparison: z.boolean(),
  currentDecision: z.boolean(), splitFocus: z.boolean(), includeTranscriptEvidence: z.boolean(),
});
export type ResearchQueryPlan = z.infer<typeof ResearchQueryPlanSchema>;

export const RESEARCH_SCOPE_PRESETS = ["THIS_WEEK", "LAST_7_DAYS", "LAST_14_DAYS", "LAST_30_DAYS", "THIS_SEASON", "ALL_HISTORY", "CUSTOM"] as const;
export const DEFAULT_RESEARCH_SCOPE = "LAST_7_DAYS" as const;
export type ResearchScopePreset = typeof RESEARCH_SCOPE_PRESETS[number];
export type ResearchScopeSelection = { preset: ResearchScopePreset; fromDate?: string; toDate?: string; timezoneOffsetMinutes: number };
export type ResolvedResearchScope = { preset: ResearchScopePreset; label: string; dateFrom: string | null; dateTo: string | null };

export type RetrievedInsight = {
  id: string; claim: string; reasoning: string; primaryCategory: string; recommendation: string;
  timeHorizon: string; creatorConfidence: string; evidenceText: string | null; timestampSeconds: number | null;
  validFromGameweek: number | null; validToGameweek: number | null; episodeId: string; episodeTitle: string;
  sourceUrl: string; publishedAt: string; gameweek: number | null; sourceId: string; sourceName: string;
  entities: Array<{ name: string; type: string }>;
};

export type RetrievedEvidence = {
  evidenceId: string; type: "INSIGHT"; insightId: string; episodeId: string; sourceId: string;
  sourceName: string; episodeTitle: string; episodeUrl: string; publishedAt: string;
  claim: string; reasoning: string; evidenceText: string | null; category: string;
  recommendation: string; timeHorizon: string; entities: Array<{ name: string; type: string }>;
  timestampSeconds: number | null;
};

export type RetrievedSplitDecision = {
  id: string; subject: string; question: string; primaryCategory: string; timeHorizon: string;
  unresolvedQuestion: string | null; implication: string | null;
  positions: Array<{ positionId: string; position: string; reasoning: string; supportingInsightIds: string[]; evidenceIds?: string[] }>;
};

export const ResearchFindingSchema = z.object({
  type: z.enum(["ANSWER", "CONSENSUS", "DISAGREEMENT", "REASONING", "TIME_HORIZON", "CHANGE_OVER_TIME"]),
  statement: z.string().trim().min(1), explanation: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)).min(1),
});

export const ResearchAnswerSchema = z.object({
  answerSummary: z.string().trim().min(1), answerSummaryEvidenceIds: z.array(z.string().trim().min(1)),
  findings: z.array(ResearchFindingSchema), insufficientEvidence: z.string().trim().min(1).nullable(),
});
export type ResearchAnswer = z.infer<typeof ResearchAnswerSchema>;

export type ResearchSource = { sourceId?: string; evidenceIds: string[]; episodeId: string; episodeTitle: string; sourceName: string; sourceUrl: string; publishedAt: string; timestampSeconds: number | null };
export type ResearchResponse = { question: string; scope: ResolvedResearchScope; answer: ResearchAnswer; sources: ResearchSource[]; analysis?: { id: string; createdAt: string; reused: boolean } };
export type ResearchContextMode = "GLOBAL" | "MY_TEAM";
