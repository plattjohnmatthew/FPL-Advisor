import type { Briefing } from "../../lib/intelligence/briefing";
import type { SummaryInsightContext } from "../../lib/summaries/schema";
import type { OverviewData } from "../../lib/overview/data";
import { findingsFromInsights } from "../../lib/overview/presentation";

export function insight(index = 1, sourceId = "creator-1"): SummaryInsightContext {
  return { id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, sourceId, sourceName: sourceId,
    episodeId: `episode-${index}`, episodeTitle: `Creator episode ${index}`, sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", publishedAt: `2026-10-${String(27 + (index % 5)).padStart(2, "0")}T12:00:00Z`,
    timestampSeconds: 65, claim: `Stored claim about Player ${index}. Its evidence is traceable. A third sentence is omitted.`, reasoning: "Recorded creator reasoning", primaryCategory: index % 2 ? "CAPTAINCY" : "TRANSFER_DECISION", recommendation: "BUY", timeHorizon: "SHORT",
    entities: [{ id: `player-${index}`, name: `Player ${index}`, type: "PLAYER", role: "SUBJECT" }] };
}
export function report(): Briefing {
  const insights = Array.from({ length: 6 }, (_, index) => insight(index + 1));
  return { id: "report-1", from: "2026-10-27", to: "2026-11-02", generatedAt: "2026-11-02T10:00:00Z", model: "stored-model", promptVersion: "stored-prompt", pipelineVersion: "stored-pipeline", sourceIds: ["creator-1"], episodeIds: insights.map((item) => item.episodeId), mode: "DIRECT", excludedEpisodeCount: 0, insights, splits: [],
    summary: { title: "Saved briefing", overviewParagraphs: ["A stored introduction.", "A second stored paragraph."], overviewSupportingInsightIds: insights.map((item) => item.id), splitDecisionIds: [], sections: { teamsToTarget: [], teamsToAvoid: [], playersToBuy: insights.map((item) => ({ subject: item.entities[0].name, summary: item.claim, reasoning: item.reasoning, sourceCount: 99, supportingCreatorNames: [], sentiment: "POSITIVE", interpretation: "CONSENSUS", timeHorizon: "SHORT", caveat: null, supportingInsightIds: [item.id], attention: { creatorCount: 99, insightCount: 99, episodeCount: 99 } })), playersToSell: [], mostDiscussedPlayers: [], fixtureSwings: [], chipStrategy: [], undervaluedPlayers: [], overpricedPlayers: [], watchlist: [] } } };
}
export function viewData(empty = false): OverviewData {
  const insights = empty ? [] : Array.from({ length: 6 }, (_, index) => insight(index + 1));
  return { period: { fromDate: "2026-10-27", toDate: "2026-11-02", startInclusive: "2026-10-27T00:00:00Z", endExclusive: "2026-11-03T00:00:00Z" },
    findings: findingsFromInsights(insights, ["player-1", "player-3"]), mode: empty ? "empty" : "claims", briefingGeneratedAt: null, updatedAt: empty ? null : "2026-11-02T12:00:00Z", briefingUnavailable: false, latestUnavailable: false,
    latestEpisodes: insights.slice(0, 5).map((item) => ({ id: item.episodeId, title: item.episodeTitle, creator: item.sourceName, platform: "YOUTUBE", publishedAt: item.publishedAt, claimExcerpt: item.claim })) };
}
