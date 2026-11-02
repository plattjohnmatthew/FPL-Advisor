import type { ResearchResponse, ResearchSource } from "./schema";

export function resolveCitations(ids: string[], sources: ResearchSource[]) {
  return [...new Set(ids)].flatMap((id) => {
    const source = sources.find((item) => item.evidenceIds.includes(id));
    if (!source || !/^insight:[a-zA-Z0-9-]+$/.test(id)) return [];
    return [{ id, source, href: `/episodes/${encodeURIComponent(source.episodeId)}#insight-${encodeURIComponent(id.slice(8))}` }];
  });
}
export function answerSections(response: ResearchResponse) {
  return [
    { title: "Evidence", findings: response.answer.findings.filter((item) => item.type !== "DISAGREEMENT") },
    { title: "Disagreement", findings: response.answer.findings.filter((item) => item.type === "DISAGREEMENT") },
  ].filter((section) => section.findings.length > 0);
}
export function creatorBreadth(ids: string[], sources: ResearchSource[]) {
  const cited = resolveCitations(ids, sources);
  if (!cited.length || cited.some(({ source }) => !source.sourceId)) return null;
  return new Set(cited.map(({ source }) => source.sourceId)).size;
}
export function followUpQuestions(question: string, weak: boolean) {
  const subject = question.trim().slice(0, 700);
  return weak ? [`What stored creator evidence is available about: ${subject}`, `Which related players or teams have evidence for: ${subject}`] : [`Where do creators disagree about: ${subject}`, `What are the risks and caveats for: ${subject}`];
}
export function scopeDescription(scope: ResearchResponse["scope"]) {
  return `${scope.label} · ${scope.dateFrom ?? "earliest stored evidence"} → ${scope.dateTo ? `${scope.dateTo} (exclusive)` : "latest stored evidence"}`;
}
