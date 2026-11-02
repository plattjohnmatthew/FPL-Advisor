import "server-only";
import { latestSevenLocalDates } from "@/lib/dates/calendar-window";
import { SupabaseOverviewRepository, type OverviewRepository, type OverviewPeriod, type LatestCreatorEpisode } from "./repository";
import { findingsFromBriefing, findingsFromInsights, type OverviewFinding } from "./presentation";

export type OverviewData = {
  period: OverviewPeriod; findings: OverviewFinding[]; mode: "briefing" | "claims" | "empty";
  briefing?: { id: string; from: string; to: string; freshness: string; overview: string[] } | null;
  briefingGeneratedAt: string | null; latestEpisodes: LatestCreatorEpisode[]; updatedAt: string | null;
  briefingUnavailable: boolean; latestUnavailable: boolean;
};
export async function getOverviewData(now = new Date(), repository: OverviewRepository = new SupabaseOverviewRepository()): Promise<OverviewData> {
  const period = latestSevenLocalDates(now, 0);
  const [report, latest, squad, updated] = await Promise.allSettled([repository.briefing(period), repository.latestEpisodes(), repository.squadEntityIds(), repository.updatedAt()]);
  const owned = squad.status === "fulfilled" ? squad.value : [];
  let findings = report.status === "fulfilled" && report.value ? findingsFromBriefing(report.value, owned) : [];
  let mode: OverviewData["mode"] = report.status === "fulfilled" && report.value ? "briefing" : "empty";
  let briefingUnavailable = report.status === "rejected";
  if (!findings.length && !(report.status === "fulfilled" && report.value)) {
    try { findings = findingsFromInsights(await repository.insights(period), owned); if (findings.length) mode = "claims"; }
    catch { briefingUnavailable = true; }
  }
  return { period, findings, mode, briefing: report.status === "fulfilled" && report.value ? { id: report.value.id, from: report.value.from, to: report.value.to, freshness: report.value.freshness ?? "unknown", overview: report.value.summary.overviewParagraphs } : null, briefingGeneratedAt: report.status === "fulfilled" ? report.value?.generatedAt ?? null : null,
    latestEpisodes: latest.status === "fulfilled" ? latest.value : [], updatedAt: updated.status === "fulfilled" ? updated.value : null,
    briefingUnavailable, latestUnavailable: latest.status === "rejected" };
}
