import type { ResearchAnswer, ResearchQueryPlan, RetrievedEvidence, RetrievedSplitDecision } from "./schema";

export interface ResearchQueryInterpreter { interpret(question: string, context?: { requestId: string }): Promise<ResearchQueryPlan> }
export interface ResearchAnswerGenerator {
  answer(question: string, evidence: RetrievedEvidence[], splits: RetrievedSplitDecision[], repair?: { error: string; validEvidenceIds: string[] }, context?: { requestId: string; model: string; domainContext?: unknown }): Promise<ResearchAnswer>;
}
