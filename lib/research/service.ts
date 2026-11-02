import type { ResearchAnswerGenerator, ResearchQueryInterpreter } from "./models";
import type { ResearchRepository } from "./repository";
import { DEFAULT_RESEARCH_SCOPE, ResearchAnswerSchema, type ResearchAnswer, type ResearchContextMode, type ResearchResponse, type ResearchScopeSelection, type ResearchSource, type RetrievedEvidence, type RetrievedInsight } from "./schema";
import { applyResearchScope, resolveResearchScope } from "./scope";
import { getOpenAIModel } from "@/lib/openai/model-policy";
import { CurrentSquadContextService, type CurrentSquadContext } from "@/lib/fpl-entry/context";
import { findFplPlayers } from "@/lib/fpl/repository";
import type { FplPosition } from "@/lib/fpl/types";
import type { ResearchAnalysisStore } from "./analysis-repository";
import { evidenceFingerprint, queryFingerprint } from "./analysis-cache";

export class FplResearchService {
  constructor(private readonly interpreter: ResearchQueryInterpreter, private readonly repository: ResearchRepository, private readonly answerGenerator: ResearchAnswerGenerator, private readonly squads = new CurrentSquadContextService(), private readonly replacementFinder: typeof findFplPlayers = findFplPlayers, private readonly analyses?: ResearchAnalysisStore) {}

  async ask(rawQuestion: string, selection: ResearchScopeSelection = { preset: DEFAULT_RESEARCH_SCOPE, timezoneOffsetMinutes: 0 }, contextMode: ResearchContextMode = "GLOBAL"): Promise<ResearchResponse> {
    const question = rawQuestion.trim();
    if (question.length < 3 || question.length > 1000) throw new Error("Question must be between 3 and 1000 characters.");
    const requestId = crypto.randomUUID();
    const interpreted = await this.interpreter.interpret(question, { requestId });
    this.validateDates(interpreted.dateFrom, interpreted.dateTo);
    const scope = resolveResearchScope(selection, interpreted);
    let plan = applyResearchScope(interpreted, scope);
    const squad = contextMode === "MY_TEAM" ? await this.squads.getCurrent() : null;
    if (contextMode === "MY_TEAM" && !squad) throw new Error("No saved public FPL squad is available for My Team research.");
    if (squad) plan = await this.applySquadRetrieval(question, plan, squad);
    let primaryInsights = await this.repository.searchInsights(plan);
    if (primaryInsights.length === 0 && plan.searchTerms.length > 0) {
      primaryInsights = await this.repository.searchInsights({ ...plan, searchTerms: [] });
    }
    const splits = await this.repository.searchSplits(plan, primaryInsights.map((item) => item.id));
    const primaryIds = new Set(primaryInsights.map((item) => item.id));
    const missingIds = [...new Set(splits.flatMap((split) => split.positions.flatMap((position) => position.supportingInsightIds)))].filter((id) => !primaryIds.has(id));
    const insights = [...primaryInsights, ...await this.repository.loadInsightsByIds(missingIds)];
    const queryHash = queryFingerprint(plan); const evidenceHash = evidenceFingerprint(insights, splits);
    const lookup = { question, contextMode, scope, queryFingerprint: queryHash, evidenceFingerprint: evidenceHash };
    const reusable = await this.analyses?.findReusable(lookup);
    if (reusable) return { ...reusable.response, question, analysis: { id: reusable.id, createdAt: reusable.createdAt, reused: true } };
    const evidence = insights.map(toEvidence);
    const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
    const normalizedSplits = splits.map((split) => ({ ...split, positions: split.positions.map((position) => ({ ...position, evidenceIds: position.supportingInsightIds.map(evidenceId) })) }));

    if (evidence.length === 0) return this.persist({
      question, scope, answer: { answerSummary: "There is not enough evidence in the selected period to answer this question.", answerSummaryEvidenceIds: [], findings: [], insufficientEvidence: `No relevant stored insights were found within ${scope.label}.` }, sources: [],
    }, lookup, [], [], null);

    let answer: ResearchAnswer;
    const answerModel = getOpenAIModel("CHAT_ANSWER");
    try {
      answer = ResearchAnswerSchema.parse(await this.answerGenerator.answer(question, evidence, normalizedSplits, undefined, { requestId, model: answerModel, domainContext: squad ? this.answerSquadContext(squad, plan) : undefined }));
      this.validateAnswer(answer, evidenceById);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid grounded answer";
      answer = ResearchAnswerSchema.parse(await this.answerGenerator.answer(question, evidence, normalizedSplits, { error: message, validEvidenceIds: [...evidenceById.keys()] }, { requestId, model: answerModel, domainContext: squad ? this.answerSquadContext(squad, plan) : undefined }));
      this.validateAnswer(answer, evidenceById);
    }
    const cited = new Set([...answer.answerSummaryEvidenceIds, ...answer.findings.flatMap((finding) => finding.evidenceIds)]);
    const sources = this.buildSources([...cited].map((id) => evidenceById.get(id)!));
    return this.persist({ question, scope, answer, sources }, lookup, [...cited].map((id) => evidenceById.get(id)!.insightId), sources.map((source) => source.episodeId), answerModel);
  }

  private async persist(response: ResearchResponse, lookup: { question: string; contextMode: ResearchContextMode; scope: ResearchResponse["scope"]; queryFingerprint: string; evidenceFingerprint: string }, citedInsightIds: string[], sourceEpisodeIds: string[], answerModel: string | null) {
    if (!this.analyses) return response;
    const saved = await this.analyses.save({ ...lookup, response, citedInsightIds, sourceEpisodeIds, queryModel: getOpenAIModel("QUERY_INTERPRETATION"), answerModel });
    return { ...response, analysis: { id: saved.id, createdAt: saved.createdAt, reused: false } };
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
      else sources.set(item.episodeId, { sourceId: item.sourceId, evidenceIds: [item.evidenceId], episodeId: item.episodeId, episodeTitle: item.episodeTitle, sourceName: item.sourceName, sourceUrl: item.episodeUrl, publishedAt: item.publishedAt, timestampSeconds: item.timestampSeconds });
    }
    return [...sources.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }

  private async applySquadRetrieval(question: string, plan: import("./schema").ResearchQueryPlan, squad: CurrentSquadContext) {
    const normalized = question.toLocaleLowerCase();
    const position = normalized.includes("midfield") ? "MID" : normalized.includes("defender") || normalized.includes("defence") ? "DEF" : normalized.includes("forward") || normalized.includes("striker") ? "FWD" : normalized.includes("goalkeeper") || normalized.includes("keeper") ? "GK" : null;
    const owned = position ? squad.players.filter((player) => player.position === position) : squad.players;
    const replacement = /replace|replacement|alternative|instead of/.test(normalized);
    let names = owned.map((player) => player.playerName);
    if (replacement) {
      const explicitPrice = normalized.match(/£?([0-9]+(?:\.[0-9])?)m?/i)?.[1];
      const maxPrice = explicitPrice ? Number(explicitPrice) : Math.max(...owned.map((player) => player.currentPrice), 0) + 0.5;
      const candidatePosition = (position ?? (owned.length === 1 ? owned[0]?.position : null)) as FplPosition | null;
      const candidates = await this.replacementFinder({ position: candidatePosition ?? undefined, maxPrice });
      const ownedIds = new Set(squad.playerIds);
      names = [...names, ...candidates.filter((candidate) => !ownedIds.has(Number(candidate.fpl_player_id))).slice(0, 40).map((candidate) => candidate.canonical_name as string)];
    }
    return { ...plan, playerEntities: [...new Set(names)], maxResults: Math.max(plan.maxResults, replacement ? 60 : 40) };
  }

  private answerSquadContext(squad: CurrentSquadContext, plan: import("./schema").ResearchQueryPlan) {
    const ownedNames = new Set(squad.players.map((player) => player.playerName.toLocaleLowerCase()));
    return { mode: "MY_TEAM", entryId: squad.entryId, gameweek: squad.gameweek, entryName: squad.entryName,
      captain: squad.captain.playerName, viceCaptain: squad.viceCaptain.playerName,
      nonOwnedCandidateNames: plan.playerEntities.filter((name) => !ownedNames.has(name.toLocaleLowerCase())),
      players: squad.players.map((player) => ({ name: player.playerName, fplPlayerId: player.fplPlayerId, owned: true, starting: player.isStarter, benchOrder: player.benchOrder, position: player.position, club: player.teamName, price: player.currentPrice })) };
  }
}

export const evidenceId = (insightId: string) => `insight:${insightId}`;
export function toEvidence(insight: RetrievedInsight): RetrievedEvidence {
  return { evidenceId: evidenceId(insight.id), type: "INSIGHT", insightId: insight.id, episodeId: insight.episodeId, sourceId: insight.sourceId, sourceName: insight.sourceName, episodeTitle: insight.episodeTitle, episodeUrl: insight.sourceUrl, publishedAt: insight.publishedAt, claim: insight.claim, reasoning: insight.reasoning, evidenceText: insight.evidenceText, category: insight.primaryCategory, recommendation: insight.recommendation, timeHorizon: insight.timeHorizon, entities: insight.entities, timestampSeconds: insight.timestampSeconds };
}
