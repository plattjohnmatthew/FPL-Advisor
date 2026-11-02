import { z } from "zod";

export const REPORT_SECTION_KEYS = [
  "teamsToTarget", "teamsToAvoid", "playersToBuy", "playersToSell",
  "mostDiscussedPlayers", "fixtureSwings", "chipStrategy", "undervaluedPlayers",
  "overpricedPlayers", "watchlist",
] as const;

export const REPORT_INTERPRETATIONS = [
  "SINGLE_SOURCE", "MULTI_SOURCE_SUPPORT", "CONSENSUS", "SPLIT", "MIXED",
  "CREATOR_CLAIM", "DISAGREEMENT",
] as const;

const GeneratedReportItemSchema = z.object({
  subject: z.string().trim().min(1),
  sentiment: z.enum(["POSITIVE", "MIXED", "NEGATIVE", "NEUTRAL"]),
  summary: z.string().trim().min(1),
  reasoning: z.string().trim().min(1),
  sourceCount: z.number().int().min(1),
  timeHorizon: z.enum(["IMMEDIATE", "SHORT", "MEDIUM", "SEASONAL"]).nullable(),
  caveat: z.string().trim().min(1).nullable(),
  interpretation: z.enum(REPORT_INTERPRETATIONS),
  supportingInsightIds: z.array(z.string().uuid()).min(1),
});

export const ReportItemSchema = GeneratedReportItemSchema.extend({
  supportingCreatorNames: z.array(z.string()).default([]),
  attention: z.object({
    insightCount: z.number().int().min(1),
    episodeCount: z.number().int().min(1),
    creatorCount: z.number().int().min(1),
  }).default({ insightCount: 1, episodeCount: 1, creatorCount: 1 }),
});

export const RunSummarySchema = z.object({
  title: z.string().trim().min(1),
  overviewParagraphs: z.array(z.string().trim().min(1)).min(2).max(4),
  overviewSupportingInsightIds: z.array(z.string().uuid()).min(1),
  sections: z.object(Object.fromEntries(REPORT_SECTION_KEYS.map((key) => [key, z.array(ReportItemSchema)])) as {
    [K in typeof REPORT_SECTION_KEYS[number]]: z.ZodArray<typeof ReportItemSchema>
  }),
  splitDecisionIds: z.array(z.string().uuid()),
});

export function createRunSummaryOutputSchema(
  insightIds: string[],
  splitDecisionIds: string[],
  allowMultiCreatorInterpretation = true,
) {
  if (insightIds.length === 0) throw new Error("A run summary requires at least one allowed insight ID.");
  const reportItem = GeneratedReportItemSchema.extend({
    supportingInsightIds: z.array(z.string().uuid()).min(1),
    interpretation: allowMultiCreatorInterpretation
      ? ReportItemSchema.shape.interpretation
      : z.literal("CREATOR_CLAIM"),
  });
  const allowedSplitIds = splitDecisionIds.length > 0
    ? z.array(z.enum(splitDecisionIds as [string, ...string[]]))
    : z.array(z.string()).max(0);

  return RunSummarySchema.extend({
    overviewSupportingInsightIds: z.array(z.string().uuid()).min(1),
    sections: z.object(Object.fromEntries(REPORT_SECTION_KEYS.map((key) => [key, z.array(reportItem)])) as {
      [K in typeof REPORT_SECTION_KEYS[number]]: z.ZodArray<typeof reportItem>
    }),
    splitDecisionIds: allowedSplitIds,
  });
}

export type RunSummary = z.infer<typeof RunSummarySchema>;
export type SummaryInsightContext = {
  id: string; sourceId: string; sourceName: string; episodeId: string; episodeTitle: string;
  sourceUrl: string; publishedAt: string; timestampSeconds: number | null; claim: string; reasoning: string; primaryCategory: string;
  recommendation: string; timeHorizon: string; entities: Array<{ id?: string; type: "PLAYER" | "TEAM"; name: string; role: string }>;
};
export type SummarySplitContext = {
  id: string; question: string; unresolvedQuestion: string | null; implication: string | null;
  positions: Array<{ position: string; reasoning: string; supportingInsightIds: string[]; creators: string[]; creatorCount: number }>;
};
export type RunSummaryContext = {
  scope: { type: "RUN"; runId: string } | { type: "DATE_RANGE"; fromDate: string; toDate: string };
  runId: string | null; runStatus: "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED" | null;
  eligibleEpisodeIds: string[]; includedEpisodeIds: string[];
  excludedEpisodes: Array<{ episodeId: string; title: string; sourceName: string; reason: string }>;
  excludedEpisodeCount: number; distinctCreatorCount: number;
  failedEpisodes: Array<{ episodeId: string; title: string; sourceName: string; errorMessage: string }>;
  insights: SummaryInsightContext[]; splitDecisions: SummarySplitContext[];
};
export type SynthesisScope = RunSummaryContext["scope"];
