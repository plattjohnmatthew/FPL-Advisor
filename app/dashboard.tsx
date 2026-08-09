"use client";

import { useEffect, useState } from "react";
import type { DashboardEpisode, DashboardSnapshot } from "@/lib/dashboard/types";
import { REPORT_SECTION_KEYS } from "@/lib/summaries/schema";
import type { ResearchResponse } from "@/lib/research/schema";
import type { ResearchScopePreset } from "@/lib/research/schema";
import { DEFAULT_RESEARCH_SCOPE } from "@/lib/research/schema";
import { formatDisplayDate } from "@/lib/dates/display";
import { DEFAULT_YOUTUBE_MAX_VIDEOS_PER_CREATOR, MAX_YOUTUBE_VIDEOS_PER_CREATOR } from "@/lib/processing/options";

const sectionLabels: Record<typeof REPORT_SECTION_KEYS[number], string> = {
  teamsToTarget: "Upcoming fixtures and teams to target",
  teamsToAvoid: "Teams and fixtures to avoid",
  playersToBuy: "Players to buy or bring in",
  playersToSell: "Players to sell, remove or avoid",
  mostDiscussedPlayers: "Most discussed players",
  fixtureSwings: "Fixture runs and fixture swings",
  chipStrategy: "Chip and wildcard strategy",
  undervaluedPlayers: "Undervalued and value picks",
  overpricedPlayers: "Overpriced and poor value",
  watchlist: "Watchlist and emerging themes",
};

function formatRunDate(value: string | null) {
  return formatDisplayDate(value, { dateStyle: "medium", timeStyle: "short" }, "No runs yet");
}

function humanizeStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function localDateValue(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function EpisodeStatus({ episode, showSource = false }: { episode: DashboardEpisode; showSource?: boolean }) {
  return (
    <li className="episode-row">
      <div className="episode-content">
        <div className="episode-main">
          <span className={`status-dot status-${episode.status.toLowerCase()}`} aria-hidden="true" />
          <div>
            <p className="episode-title">{episode.sourceUrl ? <a href={episode.sourceUrl} target="_blank" rel="noreferrer">{episode.title}</a> : episode.title}</p>
            {showSource && <p className="episode-source">{episode.sourceName}</p>}
            {episode.publishedAt && <p className="episode-source">Published {formatDisplayDate(episode.publishedAt)} · {episode.insightCount} insight{episode.insightCount === 1 ? "" : "s"}</p>}
            {showSource && <p className="episode-source">Transcript: {humanizeStatus(episode.transcriptStatus)} · Extraction: {humanizeStatus(episode.extractionStatus)}</p>}
            {episode.errorMessage && <p className="episode-error">{episode.errorMessage}</p>}
            {episode.errorStage && <p className="episode-source">Stage: {humanizeStatus(episode.errorStage)} Â· {episode.errorRetryable ? "Retryable" : "Manual review required"}</p>}
          </div>
        </div>
      </div>
      <span className={`status-label status-label-${episode.status.toLowerCase()}`}>
        {humanizeStatus(episode.status)}
      </span>
    </li>
  );
}

export default function Dashboard({ initialSnapshot }: { initialSnapshot: DashboardSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isStarting, setIsStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [researchAnswers, setResearchAnswers] = useState<ResearchResponse[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchScope, setResearchScope] = useState<ResearchScopePreset>(DEFAULT_RESEARCH_SCOPE);
  const [researchFromDate, setResearchFromDate] = useState("");
  const [researchToDate, setResearchToDate] = useState("");
  const [isStopping, setIsStopping] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisActionError, setSynthesisActionError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(initialSnapshot.defaultFromDate);
  const [toDate, setToDate] = useState(initialSnapshot.defaultToDate);
  const [processingFromDate, setProcessingFromDate] = useState(() => localDateValue(6));
  const [processingToDate, setProcessingToDate] = useState(() => localDateValue(0));
  const [youtubeLimit, setYoutubeLimit] = useState(DEFAULT_YOUTUBE_MAX_VIDEOS_PER_CREATOR);
  const [creatorSearch, setCreatorSearch] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [isSavingSources, setIsSavingSources] = useState(false);
  const [extractionInstructions, setExtractionInstructions] = useState(initialSnapshot.aiInstructions.extraction.value);
  const [synthesisInstructions, setSynthesisInstructions] = useState(initialSnapshot.aiInstructions.synthesis.value);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [instructionsMessage, setInstructionsMessage] = useState<string | null>(null);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);

  async function refreshSnapshot(period?: { fromDate: string; toDate: string }) {
    const params = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()) });
    if (period) { params.set("synthesisFromDate", period.fromDate); params.set("synthesisToDate", period.toDate); }
    const response = await fetch(`/api/processing-runs?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to refresh processing status.");
    setSnapshot(body as DashboardSnapshot);
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshSnapshot().catch(() => undefined), 0);
    if (!["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus)) {
      return () => window.clearTimeout(initialRefresh);
    }
    const timer = window.setInterval(() => void refreshSnapshot().catch(() => undefined), 350);
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(timer); };
  }, [snapshot.currentRunStatus]);

  async function processEpisodes() {
    const selectedSourceIds = snapshot.sourceLibrary.filter((source) => source.enabled && source.selectedByDefault).map((source) => source.id);
    if (selectedSourceIds.length === 0) { setActionError("Select at least one creator before processing."); return; }
    setIsStarting(true);
    setActionError(null);
    setSnapshot((current) => ({ ...current, currentRunStatus: "RUNNING" }));
    const timer = window.setInterval(() => void refreshSnapshot().catch(() => undefined), 350);

    try {
      const response = await fetch("/api/processing-runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate: processingFromDate, toDate: processingToDate,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          youtubeMaxVideosPerCreator: youtubeLimit,
          selectedSourceIds,
        }),
      });
      const body = await response.json();
      if (!response.ok && response.status !== 201) {
        throw new Error(body.error ?? "The processing run could not be completed.");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The processing run could not be completed.");
    } finally {
      window.clearInterval(timer);
      await refreshSnapshot().catch((error) => {
        setActionError(error instanceof Error ? error.message : "Unable to refresh processing status.");
      });
      setIsStarting(false);
    }
  }

  async function saveSourceSelection(sourceId: string, selected: boolean) {
    const next = snapshot.sourceLibrary.map((source) => source.id === sourceId ? { ...source, selectedByDefault: selected } : source);
    const selectedSourceIds = next.filter((source) => source.enabled && source.selectedByDefault).map((source) => source.id);
    setSnapshot((current) => ({ ...current, sourceLibrary: next })); setIsSavingSources(true); setSourceMessage(null);
    try {
      const response = await fetch("/api/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedSourceIds }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to save creator selection.");
    } catch (error) { await refreshSnapshot().catch(() => undefined); setActionError(error instanceof Error ? error.message : "Unable to save creator selection."); }
    finally { setIsSavingSources(false); }
  }

  async function addCreator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSavingSources(true); setSourceMessage(null); setActionError(null);
    try {
      const response = await fetch("/api/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelUrl }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to add creator.");
      setChannelUrl(""); setSourceMessage(body.message); await refreshSnapshot();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to add creator."); }
    finally { setIsSavingSources(false); }
  }

  async function updateInstructions(method: "PUT" | "DELETE") {
    setIsSavingInstructions(true); setInstructionsMessage(null); setInstructionsError(null);
    try {
      const response = await fetch("/api/prompt-settings", {
        method,
        headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PUT" ? JSON.stringify({ extractionInstructions, synthesisInstructions }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save AI instructions.");
      const next = {
        extraction: body.settings.EXTRACTION_CUSTOM_INSTRUCTIONS,
        synthesis: body.settings.SYNTHESIS_CUSTOM_INSTRUCTIONS,
      };
      setExtractionInstructions(next.extraction.value); setSynthesisInstructions(next.synthesis.value);
      setSnapshot((current) => ({ ...current, aiInstructions: next }));
      setInstructionsMessage(method === "DELETE" ? "Default instructions restored. Existing outputs were not changed." : "Instructions saved. They apply only to future AI calls.");
    } catch (error) {
      setInstructionsError(error instanceof Error ? error.message : "Unable to save AI instructions.");
    } finally { setIsSavingInstructions(false); }
  }

  async function askResearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = question.trim();
    if (!submitted || isAsking) return;
    setIsAsking(true);
    setResearchError(null);
    try {
      const response = await fetch("/api/research-query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          question: submitted, scope: researchScope, fromDate: researchFromDate, toDate: researchToDate,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to answer the research question.");
      setResearchAnswers((answers) => [...answers, body as ResearchResponse]);
      setQuestion("");
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Unable to answer the research question.");
    } finally {
      setIsAsking(false);
    }
  }

  async function stopProcessing() {
    if (!snapshot.latestRunId) return;
    setIsStopping(true); setActionError(null);
    try {
      const response = await fetch("/api/processing-runs/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: snapshot.latestRunId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to stop processing.");
      setSnapshot((current) => ({ ...current, currentRunStatus: "CANCELLING" }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to stop processing.");
    } finally { setIsStopping(false); }
  }

  async function synthesize(payload: { scope: "LATEST_RUN" } | { scope: "DATE_RANGE"; fromDate: string; toDate: string }) {
    setIsSynthesizing(true); setSynthesisActionError(null);
    try {
      const response = await fetch("/api/syntheses", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, timezoneOffsetMinutes: new Date().getTimezoneOffset() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Synthesis failed.");
      await refreshSnapshot(payload.scope === "DATE_RANGE" ? payload : undefined);
    } catch (error) {
      setSynthesisActionError(error instanceof Error ? error.message : "Synthesis failed.");
      await refreshSnapshot(payload.scope === "DATE_RANGE" ? payload : undefined).catch(() => undefined);
    } finally { setIsSynthesizing(false); }
  }

  const runIsActive = isStarting || ["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus);
  const selectedCreators = snapshot.sourceLibrary.filter((source) => source.enabled && source.selectedByDefault);
  const filteredCreators = snapshot.sourceLibrary.filter((source) => source.name.toLowerCase().includes(creatorSearch.toLowerCase()));
  const remainingCount = snapshot.episodes.filter((episode) => !["COMPLETED", "FAILED", "CANCELLED"].includes(episode.status)).length;
  const insightById = new Map(snapshot.supportingInsights.map((insight) => [insight.id, insight]));

  return (
    <main className="dashboard-shell">
      <header className="page-header">
        <p className="eyebrow">Personal FPL knowledge base</p>
        <h1>FPL Research</h1>
        <p>Process your trusted sources, review what happened, and build a research history over time.</p>
      </header>

      {(snapshot.loadError || actionError) && (
        <div className="alert" role="alert">{actionError ?? snapshot.loadError}</div>
      )}

      <section className="panel" aria-labelledby="processing-heading">
        <div className="section-heading">
          <div>
            <p className="section-number">01</p>
            <h2 id="processing-heading">Processing</h2>
          </div>
          {runIsActive ? (
            <button type="button" onClick={stopProcessing} disabled={isStopping || snapshot.currentRunStatus === "CANCELLING"}>
              {snapshot.currentRunStatus === "CANCELLING" ? "Stop requested…" : isStopping ? "Requesting stop…" : "Stop processing"}
            </button>
          ) : <button type="button" onClick={processEpisodes} disabled={Boolean(snapshot.loadError) || !processingFromDate || !processingToDate || selectedCreators.length === 0 || isSavingSources}>Process new content</button>}
        </div>

        {!runIsActive && (
          <>
          <details className="creator-selector">
            <summary>{selectedCreators.length} creator{selectedCreators.length === 1 ? "" : "s"} selected</summary>
            <div className="creator-menu">
              <input aria-label="Search creators" placeholder="Search creators…" value={creatorSearch} onChange={(event) => setCreatorSearch(event.target.value)} />
              <div className="creator-options">{filteredCreators.map((source) => <label key={source.id} className={!source.enabled ? "disabled-source" : ""}><input type="checkbox" checked={source.enabled && source.selectedByDefault} disabled={!source.enabled || isSavingSources} onChange={(event) => void saveSourceSelection(source.id, event.target.checked)} /><span>{source.name}<small>{source.platform}{!source.enabled ? " · Disabled" : ""}</small></span></label>)}</div>
              <form className="add-creator" onSubmit={addCreator}><label>Add YouTube channel<input type="url" required placeholder="Paste YouTube channel URL" value={channelUrl} onChange={(event) => setChannelUrl(event.target.value)} /></label><button type="submit" disabled={isSavingSources}>{isSavingSources ? "Saving…" : "Add creator"}</button></form>
              {sourceMessage && <p className="source-message" role="status">{sourceMessage}</p>}
            </div>
          </details>
          {selectedCreators.length === 0 && <p className="episode-error">Select at least one creator before processing.</p>}
          <div className="processing-scope">
            <label>From<input type="date" value={processingFromDate} onChange={(event) => setProcessingFromDate(event.target.value)} /></label>
            <label>To<input type="date" value={processingToDate} onChange={(event) => setProcessingToDate(event.target.value)} /></label>
            <label>Max YouTube videos per creator<input type="number" min="1" max={MAX_YOUTUBE_VIDEOS_PER_CREATOR} value={youtubeLimit} onChange={(event) => setYoutubeLimit(Number(event.target.value))} /></label>
            <p className="helper-text">Already processed episodes will be skipped. Maximum allowed: {MAX_YOUTUBE_VIDEOS_PER_CREATOR} per creator.</p>
          </div>
          </>
        )}

        <dl className="metrics">
          <div><dt>Last run</dt><dd>{formatRunDate(snapshot.lastRunAt)}</dd></div>
          <div><dt>Sources checked</dt><dd>{snapshot.sourcesChecked} / {snapshot.latestRunSources.length || selectedCreators.length}</dd></div>
          <div><dt>Run status</dt><dd><span className={`run-status run-${snapshot.currentRunStatus.toLowerCase()}`}>{humanizeStatus(snapshot.currentRunStatus)}</span></dd></div>
        </dl>
        {snapshot.latestRunSources.length > 0 && <p className="helper-text">Run creators: {snapshot.latestRunSources.map((source) => source.name).join(", ")}</p>}

        {runIsActive && (
          <div className="live-run" aria-live="polite">
            <div className="live-heading">
              <div>
                <p className="live-kicker"><span className="pulse" /> {snapshot.currentRunStatus === "CANCELLING" ? "Stopping after current operation…" : "Run in progress"}</p>
                <h3>{snapshot.activeSourceNames.length > 0 ? snapshot.activeSourceNames.join(", ") : "Preparing enabled sources…"}</h3>
              </div>
              <div className="count-pair">
                <span><strong>{snapshot.completedCount}</strong> completed</span>
                <span><strong>{snapshot.failedCount}</strong> failed</span>
                <span><strong>{remainingCount}</strong> remaining</span>
              </div>
            </div>
            <p className="discovery-count">{snapshot.episodesDiscovered} new episodes discovered</p>
            {snapshot.discoveryStart && snapshot.discoveryEnd && <p className="helper-text">Period: {formatRunDate(snapshot.discoveryStart)} – {formatDisplayDate(Date.parse(snapshot.discoveryEnd) - 1, { dateStyle: "medium", timeStyle: "short" })} · YouTube limit: {snapshot.youtubeMaxVideosPerCreator} per creator · {snapshot.episodesSelected} selected · {snapshot.episodesDeferred} deferred</p>}
            {snapshot.episodes.length > 0 && <ul className="episode-list">{snapshot.episodes.map((episode) => <EpisodeStatus key={episode.episodeId} episode={episode} showSource />)}</ul>}
          </div>
        )}
        {snapshot.currentRunStatus === "CANCELLED" && (
          <div className="partial-note"><strong>Run stopped.</strong> {snapshot.completedCount} processed, {snapshot.failedCount} failed, {snapshot.cancelledCount} not processed.</div>
        )}

        {!runIsActive && snapshot.failedCount > 0 && (
          <div className="failure-summary">
            <h3>Failures requiring retry</h3>
            <ul className="episode-list">{snapshot.episodes.filter((episode) => episode.status === "FAILED").map((episode) => <EpisodeStatus key={episode.episodeId} episode={episode} showSource />)}</ul>
          </div>
        )}
        {snapshot.runFailures.length > 0 && (
          <div className="failure-summary">
            <h3>Run-level failures</h3>
            <ul>{snapshot.runFailures.map((failure, index) => (
              <li key={`${failure.stage}-${failure.occurredAt}-${index}`}>
                <strong>{humanizeStatus(failure.stage)}</strong>: {failure.errorMessage} ({failure.retryable ? "retryable" : "manual review required"})
              </li>
            ))}</ul>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="instructions-heading">
        <div className="section-heading compact-heading">
          <div><p className="section-number">02</p><h2 id="instructions-heading">AI instructions</h2></div>
        </div>
        <p className="helper-text">Adjust emphasis and writing style. Core grounding, evidence, provenance, taxonomy, and output-format rules remain enforced.</p>
        <div className="instruction-fields">
          <label>Insight extraction instructions
            <textarea value={extractionInstructions} onChange={(event) => setExtractionInstructions(event.target.value)} maxLength={4000} rows={6} disabled={isSavingInstructions} />
            <small>Applies to future episode extractions only. Historical episodes are not reprocessed.</small>
          </label>
          <label>Synthesis/report instructions
            <textarea value={synthesisInstructions} onChange={(event) => setSynthesisInstructions(event.target.value)} maxLength={4000} rows={6} disabled={isSavingInstructions} />
            <small>Saving does not make an OpenAI call. Click Regenerate on a report when you want to apply changes.</small>
          </label>
        </div>
        <div className="instruction-actions">
          <button type="button" onClick={() => void updateInstructions("PUT")} disabled={isSavingInstructions}>{isSavingInstructions ? "Saving…" : "Save"}</button>
          <button type="button" className="secondary-button" onClick={() => void updateInstructions("DELETE")} disabled={isSavingInstructions}>Reset to default</button>
        </div>
        {instructionsMessage && <p className="source-message" role="status">{instructionsMessage}</p>}
        {instructionsError && <p className="episode-error" role="alert">{instructionsError}</p>}
      </section>

      <section className="panel" aria-labelledby="latest-heading">
        <div className="section-heading compact-heading">
          <div><p className="section-number">03</p><h2 id="latest-heading">Latest transcripts</h2></div>
          <p>{snapshot.recentEpisodes.length} episode{snapshot.recentEpisodes.length === 1 ? "" : "s"} · {snapshot.defaultPeriodLabel}</p>
        </div>
        {snapshot.recentEpisodes.length > 0 ? (
          <ul className="episode-list latest-list">{snapshot.recentEpisodes.map((episode) => <EpisodeStatus key={episode.episodeId} episode={episode} showSource />)}</ul>
        ) : (
          <div className="empty-state"><p>No episodes found for this period.</p></div>
        )}
        <div className="run-report">
          <p className="summary-label">Synthesis</p>
          <div className="synthesis-actions">
            <button type="button" onClick={() => synthesize({ scope: "DATE_RANGE", fromDate: snapshot.defaultFromDate, toDate: snapshot.defaultToDate })} disabled={isSynthesizing || runIsActive || snapshot.recentEpisodes.length === 0}>{isSynthesizing ? "Synthesizing…" : snapshot.synthesis ? "Regenerate synthesis" : "Generate synthesis"}</button>
            <p className="helper-text">Each click makes a new OpenAI call using stored insights only.</p>
            <div className="chat-row">
              <label>From <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
              <label>To <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
              <button type="button" onClick={() => synthesize({ scope: "DATE_RANGE", fromDate, toDate })} disabled={isSynthesizing || runIsActive || !fromDate || !toDate}>Synthesize period</button>
            </div>
          </div>
          {(synthesisActionError || snapshot.synthesisAttemptError) && <div className="alert" role="alert">{synthesisActionError ?? snapshot.synthesisAttemptError} You can retry synthesis without reprocessing episodes.</div>}
          {snapshot.synthesisScopeLabel && <p className="helper-text">Scope: {snapshot.synthesisScopeLabel}. {snapshot.synthesisEligibleCount} eligible episodes, {snapshot.synthesisIncludedCount} included, {snapshot.synthesisExcludedCount} excluded, {snapshot.synthesisDistinctCreatorCount} distinct creators. Generated {formatDisplayDate(snapshot.synthesisGeneratedAt)} with {snapshot.synthesisModel} · {snapshot.synthesisPromptVersion}.</p>}
          {snapshot.synthesisExcludedEpisodes.length > 0 && <div className="partial-note"><strong>Partial report:</strong> {snapshot.synthesisExcludedEpisodes.map((episode) => `${episode.sourceName} — ${episode.title}: ${episode.reason}`).join("; ")}</div>}
          {snapshot.runFailures.some((failure) => failure.stage === "SPLIT_DECISION_GENERATION") && <div className="partial-note"><strong>Derived-analysis warning:</strong> Some invalid split-decision candidates were discarded. The underlying episode insights remain included in synthesis.</div>}
          {snapshot.synthesisStale && <div className="partial-note"><strong>New processed content is available since this synthesis was generated.</strong> Regenerate only when you want to make a new OpenAI call.</div>}
          {snapshot.synthesisInstructionsStale && <div className="partial-note"><strong>This report was created with older synthesis instructions.</strong> It remains unchanged until you explicitly regenerate it.</div>}
          {snapshot.reportError && <div className="alert" role="alert">Report display error: {snapshot.reportError}</div>}
          {snapshot.synthesis ? <>
            <h3 className="report-title">{snapshot.synthesis.title}</h3>
            <div className="report-overview">{snapshot.synthesis.overviewParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          </> : <div className="empty-state"><p>{snapshot.recentInsights.length > 0 ? "No synthesis has been generated for this period." : "No processed FPL insights are available for this period."}</p></div>}
          {snapshot.synthesis && <p className="evidence-links">Evidence: {snapshot.synthesis.overviewSupportingInsightIds.map((id, index) => (
            <span key={id}>{index > 0 && ", "}<a href={`#insight-${id}`}>{insightById.get(id)?.sourceName ?? id}</a></span>
          ))}</p>}
          {snapshot.synthesis && REPORT_SECTION_KEYS.filter((key) => snapshot.synthesis!.sections[key].length > 0).map((key) => (
            <section className="report-section" key={key}>
              <h3>{sectionLabels[key]}</h3>
              {snapshot.synthesis!.sections[key].length > 0 ? (
                <div className="report-items">{snapshot.synthesis!.sections[key].map((item, index) => (
                  <article className="report-item" key={`${key}-${index}`}>
                    <span className={`interpretation interpretation-${item.interpretation.toLowerCase()}`}>{humanizeStatus(item.interpretation)}</span>
                    <span className={`sentiment sentiment-${item.sentiment.toLowerCase()}`}>{humanizeStatus(item.sentiment)}</span>
                    <h4>{item.subject}</h4>
                    <p>{item.summary}</p>
                    <p><strong>Why:</strong> {item.reasoning}</p>
                    <p className="insight-meta">{item.sourceCount} supporting creator{item.sourceCount === 1 ? "" : "s"}{item.timeHorizon ? ` · ${humanizeStatus(item.timeHorizon)} horizon` : ""}</p>
                    {item.caveat && <p className="report-caveat"><strong>Caveat:</strong> {item.caveat}</p>}
                    <p className="evidence-links">Evidence: {item.supportingInsightIds.map((id, evidenceIndex) => (
                      <span key={id}>{evidenceIndex > 0 && ", "}{insightById.get(id) ? <a href={insightById.get(id)!.sourceUrl} target="_blank" rel="noreferrer">{insightById.get(id)!.sourceName} — {insightById.get(id)!.episodeTitle} ({formatDisplayDate(insightById.get(id)!.publishedAt)})</a> : "Source unavailable"}</span>
                    ))}</p>
                  </article>
                ))}</div>
              ) : <p className="no-findings">No material developments.</p>}
            </section>
          ))}
        </div>

        {snapshot.splitDecisions.length > 0 && (
          <div className="report-block">
            <h3>Split decisions</h3>
            {snapshot.splitDecisions.map((decision) => (
              <article className="split-card" key={decision.id}>
                <h4>{decision.question}</h4>
                <div className="position-grid">{decision.positions.map((position) => (
                  <div key={`${decision.id}-${position.position}`}>
                    <h5>{position.position}</h5>
                    <p><strong>Supported by:</strong> {position.creators.join(", ")}</p>
                    <p>{position.reasoning}</p>
                    <p className="evidence-links">Evidence: {position.supportingInsightIds.map((id, index) => {
                      const evidence = insightById.get(id);
                      return <span key={id}>{index > 0 && ", "}{evidence ? <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceName} — {evidence.episodeTitle}</a> : id}</span>;
                    })}</p>
                  </div>
                ))}</div>
                {(decision.unresolvedQuestion || decision.implication) && <p className="unresolved"><strong>Unresolved / implication:</strong> {[decision.unresolvedQuestion, decision.implication].filter(Boolean).join(" ")}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel research-panel" aria-labelledby="research-heading">
        <div className="section-heading compact-heading"><div><p className="section-number">04</p><h2 id="research-heading">Ask FPL Research</h2></div></div>
        {researchAnswers.length > 0 && <div className="research-history" aria-live="polite">{researchAnswers.map((response, responseIndex) => (
          <article className="research-answer" key={`${response.question}-${responseIndex}`}>
            <p className="research-question">You asked: {response.question}</p>
            <p className="insight-meta">Searched: {response.scope.label}</p>
            <p className="answer-summary">{response.answer.answerSummary}</p>
            {response.answer.findings.length > 0 && <ul>{response.answer.findings.map((finding, index) => (
              <li key={`${finding.type}-${index}`}>
                <span className={`interpretation interpretation-${finding.type === "CONSENSUS" ? "consensus" : finding.type === "DISAGREEMENT" ? "disagreement" : "creator_claim"}`}>{humanizeStatus(finding.type)}</span>
                <p>{finding.statement}</p>
                <p className="insight-meta">{finding.explanation}</p>
              </li>
            ))}</ul>}
            {response.answer.insufficientEvidence && <p className="insufficient-evidence"><strong>Evidence limitation:</strong> {response.answer.insufficientEvidence}</p>}
            {response.sources.length > 0 && <div className="answer-sources"><h3>Source episodes used</h3><ul>{response.sources.map((source) => (
              <li key={source.episodeId}><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.episodeTitle}</a><span>{source.sourceName} · {formatRunDate(source.publishedAt)}</span></li>
            ))}</ul></div>}
          </article>
        ))}</div>}
        <form onSubmit={askResearch}>
          <div className="research-scope">
            <label htmlFor="research-scope">Searching
              <select id="research-scope" value={researchScope} onChange={(event) => setResearchScope(event.target.value as ResearchScopePreset)} disabled={isAsking}>
                <option value="THIS_WEEK">This week</option><option value="LAST_7_DAYS">Last 7 days</option>
                <option value="LAST_30_DAYS">Last 30 days</option><option value="THIS_SEASON">This season</option>
                <option value="ALL_HISTORY">All history</option><option value="CUSTOM">Custom</option>
              </select>
            </label>
            {researchScope === "CUSTOM" && <>
              <label>From<input type="date" value={researchFromDate} onChange={(event) => setResearchFromDate(event.target.value)} /></label>
              <label>To<input type="date" value={researchToDate} onChange={(event) => setResearchToDate(event.target.value)} /></label>
            </>}
          </div>
          <label htmlFor="research-question">Question</label>
          <div className="chat-row">
            <input id="research-question" type="text" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="Ask about your historical FPL research" disabled={isAsking} />
            <button type="submit" disabled={isAsking || question.trim().length < 3 || (researchScope === "CUSTOM" && (!researchFromDate || !researchToDate))}>{isAsking ? "Researching…" : "Ask"}</button>
          </div>
        </form>
        {researchError && <p className="episode-error" role="alert">{researchError}</p>}
        <p className="helper-text">Questions search the selected publication period. This week means Monday through Sunday in your local timezone.</p>
      </section>
    </main>
  );
}
