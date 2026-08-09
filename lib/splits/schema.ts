import { z } from "zod";
import { PRIMARY_CATEGORIES, TIME_HORIZONS } from "@/lib/insights/schema";

const stableKey = z.string().trim().min(3).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SplitPositionCandidateSchema = z.object({
  positionKey: stableKey,
  position: z.string().trim().min(1),
  reasoning: z.string().trim().min(1),
  supportingInsightIds: z.array(z.string().uuid()).min(1),
});

export const SplitDecisionCandidateOutputSchema = z.object({
  decisionKey: stableKey,
  subject: z.string().trim().min(1),
  question: z.string().trim().min(1),
  primaryCategory: z.enum(PRIMARY_CATEGORIES),
  timeHorizon: z.enum(TIME_HORIZONS),
  positions: z.array(SplitPositionCandidateSchema).min(2),
  unresolvedQuestion: z.string().trim().min(1).nullable(),
  implication: z.string().trim().min(1).nullable(),
});

export const SplitDecisionCandidateSchema = SplitDecisionCandidateOutputSchema.superRefine((decision, context) => {
  if (new Set(decision.positions.map((position) => position.positionKey)).size !== decision.positions.length) {
    context.addIssue({ code: "custom", message: "Position keys must be unique" });
  }
  const evidence = decision.positions.flatMap((position) => position.supportingInsightIds);
  if (new Set(evidence).size !== evidence.length) {
    context.addIssue({ code: "custom", message: "An insight cannot support competing positions" });
  }
});

export const SplitDetectionSchema = z.object({ splitDecisions: z.array(SplitDecisionCandidateSchema) });
export const SplitDetectionOutputSchema = z.object({ splitDecisions: z.array(SplitDecisionCandidateOutputSchema) });
export type SplitDetection = z.infer<typeof SplitDetectionSchema>;

export type SplitCandidateInsight = {
  id: string;
  sourceId: string;
  sourceName: string;
  episodeId: string;
  episodeTitle: string;
  publishedAt: string;
  claim: string;
  reasoning: string;
  primaryCategory: string;
  recommendation: string;
  timeHorizon: string;
  evidenceText: string | null;
  entities: string[];
};
