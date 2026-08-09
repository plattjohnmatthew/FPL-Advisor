import type { ResearchAnswerGenerator, ResearchQueryInterpreter } from "./models";
import type { ResearchRepository } from "./repository";
import { DEFAULT_RESEARCH_SCOPE, ResearchAnswerSchema, type ResearchAnswer, type ResearchResponse, type ResearchScopeSelection, type ResearchSource, type RetrievedEvidence, type RetrievedInsight } from "./schema";
import { applyResearchScope, resolveResearchScope } from "./scope";
import { getOpenAIModel } from "@/lib/openai/model-policy";

export class FplResearchService {
  constructor(private readonly interpreter: ResearchQueryInterpreter, private readonly repository: ResearchRepository, private readonly answerGenerator: ResearchAnswerGenerator) {}

  async ask(rawQuestion: string, selection: ResearchScopeSelection = { preset: DEFAULT_RESEARCH_SCOPE, timezoneOffsetMinutes: 0 }): Promise<ResearchResponse> {
    const question = rawQuestion.trim();
    if (question.length < 3 || question.length > 1000) throw new Error("Question must be between 3 and 1000 characters.");
    const requestId = crypto.randomUUID();
    const interpreted = await this.interpreter.interpret(question, { requestId });
    this.validateDates(interpreted.dateFrom, interpreted.dateTo);
    const scope = resolveResearchScope(selection, interpreted);
    const plan = applyResearchScope(interpreted, scope);
    let primaryInsights = await this.repository.searchInsights(plan);
    if (primaryInsights.length === 0 && plan.searchTerms.length > 0) {
      primaryInsights = await this.repository.searchInsights({ ...plan, searchTerms: [] });
    }
    const splits = await this.repository.searchSplits(plan, primaryInsights.map((item) => item.id));
    const primaryIds = new Set(primaryInsights.map((item) => item.id));
    const missingIds = [...new Set(splits.flatMap((split) => split.positions.flatMap((position) => position.supportingInsightIds)))].filter((id) => !primaryIds.has(id));
    const insights = [...primaryInsights, ...await this.repository.loadInsightsByIds(missingIds)];
    const evidence = insights.map(toEvidence);
    const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
    const normalizedSplits = splits.map((split) => ({ ...split, positions: split.positions.map((position) => ({ ...position, evidenceIds: position.supportingInsightIds.map(evidenceId) })) }));

    if (evidence.length === 0) return {
      question, scope, answer: { answerSummary: "There is not enough evidence in the selected period to answer this question.", answerSummaryEvidenceIds: [], findings: [], insufficientEvidence: `No relevant stored insights were found within ${scope.label}.` }, sources: [],
    };

    let answer: ResearchAnswer;
    const answerModel = getOpenAIModel("CHAT_ANSWER");
    try {
      answer = ResearchAnswerSchema.parse(await this.answerGenerator.answer(question, evidence, normalizedSplits, undefined, { requestId, model: answerModel }));
      this.validateAnswer(answer, evidenceById);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid grounded answer";
      answer = ResearchAnswerSchema.parse(await this.answerGenerator.answer(question, evidence, normalizedSplits, { error: message, validEvidenceIds: [...evidenceById.keys()] }, { requestId, model: answerModel }));
      this.validateAnswer(answer, evidenceById);
    }
    const cited = new Set([...answer.answerSummaryEvidenceIds, ...answer.findings.flatMap((finding) => finding.evidenceIds)]);
    return { question, scope, answer, sources: this.buildSources([...cited].map((id) => evidenceById.get(id)!)) };
  }

  private validateAnswer(answer: ResearchAnswer, evidenceById: Map<string, RetrievedEvidence>) {
    if (!answer.insufficientEvidence && answer.answerSummaryEvidenceIds.length === 0) throw new Error("The answer summary must cite retrieved evidence.");
    for (const id of [...answer.answerSummaryEvidenceIds, ...answer.findings.flatMap((finding) => finding.evidenceIds)]) {
      if (!evidenceById.has(id)) throw new Error(`Research answer referenced unknown evidence ID: ${id}`);
    }
  }

  private validateDates(from: string | null, to: string | null) {
    for (const [name, value] of [["dateFrom", from], ["dateTo", to]] as const) if (value && Number.isNaN(Date.parse(value))) throw new Error(`Query interpretation returned an invalid ${name}.`);
    if (from && to && Date.parse(from) >= Date.parse(to)) throw new Error("Query interpretation returned an invalid date range.");
  }

  private buildSources(evidence: RetrievedEvidence[]): ResearchSource[] {
    const sources = new Map<string, ResearchSource>();
    for (const item of evidence) {
      const existing = sources.get(item.episodeId);
      if (existing) existing.evidenceIds.push(item.evidenceId);
      else sources.set(item.episodeId, { evidenceIds: [item.evidenceId], episodeId: item.episodeId, episodeTitle: item.episodeTitle, sourceName: item.sourceName, sourceUrl: item.episodeUrl, publishedAt: item.publishedAt });
    }
    return [...sources.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }
}

export const evidenceId = (insightId: string) => `insight:${insightId}`;
export function toEvidence(insight: RetrievedInsight): RetrievedEvidence {
  return { evidenceId: evidenceId(insight.id), type: "INSIGHT", insightId: insight.id, episodeId: insight.episodeId, sourceId: insight.sourceId, sourceName: insight.sourceName, episodeTitle: insight.episodeTitle, episodeUrl: insight.sourceUrl, publishedAt: insight.publishedAt, claim: insight.claim, reasoning: insight.reasoning, evidenceText: insight.evidenceText, category: insight.primaryCategory, recommendation: insight.recommendation, timeHorizon: insight.timeHorizon, entities: insight.entities };
}
