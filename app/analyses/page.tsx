import { getAppCapabilities } from "@/lib/app-config";
import { notFound as publicNotFound } from "next/navigation";
import { SupabaseResearchAnalysisStore } from "@/lib/research/analysis-repository";
import { buildInsightSourceUrl, formatTimestamp, getInsightPlaybackSeconds } from "@/lib/episodes/presentation";
import { formatDisplayDate } from "@/lib/dates/display";

export const dynamic = "force-dynamic";

export default async function AnalysesPage() {
  if (getAppCapabilities().mode === "public_read_only") publicNotFound();
  const analyses = await new SupabaseResearchAnalysisStore().list();
  return <main className="detail-shell analyses-shell" id="main-content">
    <header className="detail-header settings-header">
      <p className="section-number">Saved research</p><h1>My Analyses</h1>
      <p>Every completed Ask and My Team answer is saved here with its exact evidence period. Closely matching questions can reuse a saved answer only while the resolved scope and evidence remain unchanged.</p>
    </header>
    {analyses.length === 0 ? <div className="empty-state"><p>No saved analyses yet.</p><p>Ask a question from the dashboard or My Team to create the first one.</p></div> : <section className="analysis-list">
      {analyses.map((item) => { const response = item.response; return <details className="analysis-card" key={item.id}>
        <summary><div><span className="analysis-context">{item.contextMode === "MY_TEAM" ? "My Team" : "Ask FPL Research"} · {response.scope.label}</span><h2>{item.question}</h2><p>{formatDisplayDate(item.createdAt, { dateStyle: "medium", timeStyle: "short" })} · {item.reuseCount} reuse{item.reuseCount === 1 ? "" : "s"}</p></div><span>Open</span></summary>
        <div className="analysis-body"><p className="answer-summary">{response.answer.answerSummary}</p>
          {response.answer.findings.length > 0 && <ul>{response.answer.findings.map((finding, index) => <li key={`${finding.type}-${index}`}><strong>{finding.statement}</strong><p>{finding.explanation}</p></li>)}</ul>}
          {response.answer.insufficientEvidence && <p className="insufficient-evidence">{response.answer.insufficientEvidence}</p>}
          {response.sources.length > 0 && <div className="answer-sources"><h3>Source episodes used</h3><ul>{response.sources.map((source) => { const playback = getInsightPlaybackSeconds(source.timestampSeconds); return <li key={source.episodeId}><a href={buildInsightSourceUrl(source.sourceUrl, source.timestampSeconds)} target="_blank" rel="noreferrer">{source.episodeTitle}{playback == null ? "" : ` · from ${formatTimestamp(playback)}`}</a><span>{source.sourceName} · {formatDisplayDate(source.publishedAt)}</span></li>; })}</ul></div>}
        </div>
      </details>; })}
    </section>}
  </main>;
}
