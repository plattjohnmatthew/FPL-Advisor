"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardView } from "@/components/research-page";
import { Button, Input, Select, SearchInput, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ProcessingMetrics, ProcessingWorkspace } from "@/components/processing-workspace";
import { Tabs } from "@/components/ui/interactive";
import type { DashboardEpisode, DashboardSnapshot } from "@/lib/dashboard/types";
import { REPORT_SECTION_KEYS } from "@/lib/summaries/schema";
import type { ResearchResponse } from "@/lib/research/schema";
import type { ResearchScopePreset } from "@/lib/research/schema";
import { DEFAULT_RESEARCH_SCOPE } from "@/lib/research/schema";
import { formatDisplayDate } from "@/lib/dates/display";
import { buildInsightSourceUrl, formatTimestamp, getInsightPlaybackSeconds } from "@/lib/episodes/presentation";
import { DEFAULT_YOUTUBE_MAX_VIDEOS_PER_CREATOR, MAX_YOUTUBE_VIDEOS_PER_CREATOR } from "@/lib/processing/options";
import { MAX_SPECIFIC_VIDEO_URLS, parseSpecificVideoUrls } from "@/lib/processing/youtube-url-batch";

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

function EpisodeStatus({ episode, showSource = false, dateRange, onAction, busy = false, canCancel = false }: { episode: DashboardEpisode; showSource?: boolean; dateRange?: { from: string; to: string }; onAction?: (episodeId: string, action: "PAUSE" | "RESUME" | "RETRY" | "CANCEL" | "DISMISS") => void; busy?: boolean; canCancel?: boolean }) {
  const episodeHref = `/episodes/${episode.episodeId}${dateRange ? `?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}` : ""}`;
  return (
    <li className="episode-row">
      <div className="episode-content">
        <div className="episode-main">
          <span className={`status-dot status-${episode.status.toLowerCase()}`} aria-hidden="true" />
          <div>
            <p className="episode-title"><a href={episodeHref}>{episode.title}</a></p>
            {showSource && <p className="episode-source">{episode.sourceName}</p>}
            {episode.publishedAt && <p className="episode-source">Published {formatDisplayDate(episode.publishedAt)} · {episode.insightCount} insight{episode.insightCount === 1 ? "" : "s"}</p>}
            {showSource && <p className="episode-source">Transcript: {humanizeStatus(episode.transcriptStatus)} · Extraction: {humanizeStatus(episode.extractionStatus)}</p>}
            {episode.errorMessage && <p className="episode-error">{episode.errorStage === "EXTRACTION_PERSISTENCE" ? "Insight extraction could not be saved. Your transcript is still available and this episode can be retried." : episode.errorStage === "TRANSCRIPT_ACQUISITION" ? "Transcript acquisition failed. Check provider availability or captions before retrying." : "Insight extraction failed. The stored transcript is retained; review details or retry."}</p>}
            {episode.errorStage && <p className="episode-source">Stage: {humanizeStatus(episode.errorStage)} · {episode.errorRetryable ? "Retryable" : "Manual review required"}</p>}
            {episode.errorMessage && <details className="technical-details"><summary>Technical details</summary><p>{episode.errorMessage}</p></details>}
            {onAction && <div className="episode-actions">
              {episode.status === "DISCOVERED" && <><Button type="button" disabled={busy} onClick={() => onAction(episode.episodeId, "RETRY")}>Process now</Button><Button type="button" className="secondary-button" disabled={busy} onClick={() => onAction(episode.episodeId, "PAUSE")}>Pause</Button></>}
              {episode.status === "PAUSED" && <Button type="button" disabled={busy} onClick={() => onAction(episode.episodeId, "RESUME")}>Resume and process</Button>}
              {["FAILED", "CANCELLED"].includes(episode.status) && <Button type="button" disabled={busy} onClick={() => onAction(episode.episodeId, "RETRY")}>{busy ? "Retrying…" : "Retry"}</Button>}
              {["FAILED", "CANCELLED"].includes(episode.status) && <Button type="button" className="secondary-button" onClick={() => onAction(episode.episodeId, "DISMISS")}>Dismiss</Button>}
              {["DISCOVERED", "TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"].includes(episode.status) && canCancel && <Button type="button" className="secondary-button" onClick={() => onAction(episode.episodeId, "CANCEL")}>Cancel retry</Button>}
              {["TRANSCRIPT_FETCHING", "TRANSCRIPT_READY", "EXTRACTING"].includes(episode.status) && <Button type="button" className="secondary-button" disabled={busy} onClick={() => onAction(episode.episodeId, "PAUSE")}>Pause after safe operation</Button>}
            </div>}
          </div>
        </div>
      </div>
      <span className={`status-label status-label-${episode.status.toLowerCase()}`}>
        {humanizeStatus(episode.status)}
      </span>
    </li>
  );
}

export default function Dashboard({ initialSnapshot, view = "overview", initialQuestion = "" }: { initialSnapshot: DashboardSnapshot; view?: DashboardView; initialQuestion?: string }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isStarting, setIsStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [researchAnswers, setResearchAnswers] = useState<ResearchResponse[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchScope, setResearchScope] = useState<ResearchScopePreset>(DEFAULT_RESEARCH_SCOPE);
  const [researchFromDate, setResearchFromDate] = useState("");
  const [researchToDate, setResearchToDate] = useState("");
  const [isStopping, setIsStopping] = useState(false);
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
  const [specificUrls, setSpecificUrls] = useState("");
  const [isProcessingUrls, setIsProcessingUrls] = useState(false);
  const [extractionInstructions, setExtractionInstructions] = useState(initialSnapshot.aiInstructions.extraction.value);
  const [synthesisInstructions, setSynthesisInstructions] = useState(initialSnapshot.aiInstructions.synthesis.value);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [instructionsMessage, setInstructionsMessage] = useState<string | null>(null);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);
  const [processingOpen, setProcessingOpen] = useState(false);
  const [processingMode, setProcessingMode] = useState<"CREATORS" | "URLS">("CREATORS");
  const [episodeActionId, setEpisodeActionId] = useState<string | null>(null);
  const runRequestInFlight = useRef(false);
  const episodeRequestsInFlight = useRef(new Set<string>());

  const selectedPeriod = useRef({ fromDate: initialSnapshot.defaultFromDate, toDate: initialSnapshot.defaultToDate });
  const refreshSequence = useRef(0);
  const lastAppliedRefresh = useRef(0);
  const [isFiltering, setIsFiltering] = useState(false);

  async function applyPeriod() {
    if (!fromDate || !toDate || fromDate > toDate) { setSynthesisActionError("Choose a valid date range."); return; }
    setIsFiltering(true); setSynthesisActionError(null);
    try { await refreshSnapshot({ fromDate, toDate }); }
    catch (error) { setSynthesisActionError(error instanceof Error ? error.message : "Unable to filter episodes."); }
    finally { setIsFiltering(false); }
  }

  async function refreshSnapshot(period?: { fromDate: string; toDate: string }) {
    const sequence = ++refreshSequence.current;
    if (period) selectedPeriod.current = period;
    period = selectedPeriod.current;
    const params = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()) });
    if (period) { params.set("synthesisFromDate", period.fromDate); params.set("synthesisToDate", period.toDate); }
    const response = await fetch(`/api/processing-runs?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to refresh processing status.");
    if (sequence > lastAppliedRefresh.current && period.fromDate === selectedPeriod.current.fromDate && period.toDate === selectedPeriod.current.toDate) {
      lastAppliedRefresh.current = sequence;
      setSnapshot(body as DashboardSnapshot);
    }
  }

  useEffect(() => {
    let disposed = false;
    let timer: number;
    const active = isStarting || isProcessingUrls || episodeActionId !== null || ["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus);
    const poll = async () => {
      await refreshSnapshot().catch(() => undefined);
      if (!disposed && active) timer = window.setTimeout(() => void poll(), 3000);
    };
    timer = window.setTimeout(() => void poll(), 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [snapshot.currentRunStatus, isStarting, isProcessingUrls, episodeActionId]);

  async function processEpisodes() {
    if (runRequestInFlight.current || ["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus)) return;
    const selectedSourceIds = snapshot.sourceLibrary.filter((source) => source.enabled && source.selectedByDefault).map((source) => source.id);
    if (selectedSourceIds.length === 0) { setActionError("Select at least one creator before processing."); return; }
    runRequestInFlight.current = true;
    setIsStarting(true);
    setActionError(null);
    setSnapshot((current) => ({ ...current, currentRunStatus: "RUNNING" }));
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
      await refreshSnapshot().catch((error) => {
        setActionError(error instanceof Error ? error.message : "Unable to refresh processing status.");
      });
      setIsStarting(false);
      runRequestInFlight.current = false;
      window.dispatchEvent(new Event("research-health-changed"));
    }
  }

  async function processSpecificUrls() {
    if (runRequestInFlight.current || ["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus)) return;
    runRequestInFlight.current = true;
    setIsProcessingUrls(true); setActionError(null);
    setSnapshot((current) => ({ ...current, currentRunStatus: "RUNNING", runType: "SPECIFIC_URL_BATCH" }));
    try {
      const response = await fetch("/api/processing-runs/url-batch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: specificUrls }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The URL batch could not be processed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The URL batch could not be processed.");
    } finally {
      await refreshSnapshot().catch(() => undefined); setIsProcessingUrls(false);
      runRequestInFlight.current = false;
      window.dispatchEvent(new Event("research-health-changed"));
    }
  }

  async function controlEpisode(episodeId: string, action: "PAUSE" | "RESUME" | "RETRY" | "CANCEL" | "DISMISS") {
    const startsRun = action === "RETRY" || action === "RESUME";
    const key = `${episodeId}:${action}`;
    if (episodeRequestsInFlight.current.has(key) || (startsRun && (runRequestInFlight.current || ["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus)))) return false;
    episodeRequestsInFlight.current.add(key);
    if (startsRun) runRequestInFlight.current = true;
    if (startsRun) setEpisodeActionId(episodeId);
    setActionError(null);
    if (startsRun) setSnapshot((current) => ({ ...current, currentRunStatus: "RUNNING", runType: "MANUAL_EPISODE" }));
    try {
      const response = await fetch(`/api/episodes/${encodeURIComponent(episodeId)}/processing`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Unable to ${action.toLowerCase()} this episode.`);
      await refreshSnapshot();
      window.dispatchEvent(new Event("research-health-changed"));
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Unable to ${action.toLowerCase()} this episode.`);
      await refreshSnapshot().catch(() => undefined);
      return false;
    } finally {
      episodeRequestsInFlight.current.delete(key);
      if (startsRun) { setEpisodeActionId(null); runRequestInFlight.current = false; }
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
      const response = await fetch("/api/prompt-settings", { method, headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined, body: method === "PUT" ? JSON.stringify({ extractionInstructions, synthesisInstructions }) : undefined });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to save AI instructions.");
      const next = { extraction: body.settings.EXTRACTION_CUSTOM_INSTRUCTIONS, synthesis: body.settings.SYNTHESIS_CUSTOM_INSTRUCTIONS };
      setExtractionInstructions(next.extraction.value); setSynthesisInstructions(next.synthesis.value); setSnapshot((current) => ({ ...current, aiInstructions: next }));
      setInstructionsMessage(method === "DELETE" ? "Default instructions restored. Existing outputs were not changed." : "Instructions saved. They apply only to future AI calls.");
    } catch (error) { setInstructionsError(error instanceof Error ? error.message : "Unable to save AI instructions."); }
    finally { setIsSavingInstructions(false); }
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

  const runIsActive = isStarting || isProcessingUrls || episodeActionId !== null || ["RUNNING", "CANCELLING"].includes(snapshot.currentRunStatus);
  const selectedCreators = snapshot.sourceLibrary.filter((source) => source.enabled && source.selectedByDefault);
  const filteredCreators = snapshot.sourceLibrary.filter((source) => source.name.toLowerCase().includes(creatorSearch.toLowerCase()));
  const remainingCount = snapshot.episodes.filter((episode) => !["COMPLETED", "FAILED", "CANCELLED", "PAUSED"].includes(episode.status)).length;
  const insightById = new Map(snapshot.supportingInsights.map((insight) => [insight.id, insight]));
  const ownedEntityIds = new Set(snapshot.squadEntityIds);
  const findingIsOwned = (ids: string[]) => ids.some((id) => insightById.get(id)?.entities.some((entity) => entity.id && ownedEntityIds.has(entity.id)));
  let parsedUrls: ReturnType<typeof parseSpecificVideoUrls> = []; let urlValidationError: string | null = null;
  try { parsedUrls = parseSpecificVideoUrls(specificUrls); } catch (error) { urlValidationError = error instanceof Error ? error.message : "URL batch is invalid."; }
  const validUrlCount = parsedUrls.filter((item) => item.status === "VALID").length;

  return (
    <main className={`dashboard-shell${view === "sources" ? " sources-view" : ""}`} id="main-content">
      <PageHeader className="page-header dashboard-hero" eyebrow="Personal FPL knowledge base" title={view === "ask" ? "Ask AI" : view === "sources" ? "Sources & processing" : view === "intelligence" ? "Intelligence" : "Your FPL intelligence"} description={view === "sources" ? "Manage research sources and monitor content ingestion." : "Creator opinions, structured into decisions you can trace back to every source."} actions={<div className="hero-actions">{view === "sources" ? <a className="button-link" href="#processing" onClick={() => setProcessingOpen(true)}>Process content</a> : <a className="button-link secondary-button" href={view === "ask" ? "/analyses" : view === "overview" ? "/intelligence" : "/sources"}>{view === "ask" ? "My Analyses" : view === "overview" ? "Open Intelligence" : "Manage sources"}</a>}{view !== "sources" && <p>Last refreshed {formatRunDate(snapshot.lastRunAt)}</p>}</div>} />

      {(snapshot.loadError || actionError) && (
        <div className="alert" role="alert">{actionError ?? snapshot.loadError}</div>
      )}

      {view === "sources" && <ProcessingMetrics snapshot={snapshot} />}
      {(view === "sources") && <section className={`panel processing-panel ${processingOpen || runIsActive ? "is-open" : ""}`} id="processing" aria-labelledby="processing-heading">
        <div className="section-heading">
          <div>
            <p className="section-number">Processing</p>
            <h2 id="processing-heading">Sources and run controls</h2>
            <p className="section-description">{runIsActive ? "Processing continues in the background. You can browse other pages." : `${selectedCreators.length} creators selected · latest run ${humanizeStatus(snapshot.currentRunStatus)}`}</p>
          </div>
          {runIsActive ? (
            <Button type="button" onClick={stopProcessing} disabled={isStopping || snapshot.currentRunStatus === "CANCELLING"}>
              {snapshot.currentRunStatus === "CANCELLING" ? "Stop requested…" : isStopping ? "Requesting stop…" : "Stop processing"}
            </Button>
          ) : <Button className="secondary-button" type="button" aria-expanded={processingOpen} onClick={() => setProcessingOpen((open) => !open)}>{processingOpen ? "Close controls" : "Open controls"}</Button>}
        </div>

        {!runIsActive && processingOpen && <div className="processing-workspace">
          <Tabs label="Processing method" items={[{ value: "CREATORS", label: "Selected creators" }, { value: "URLS", label: "Specific URLs" }]} value={processingMode} onChange={(value) => setProcessingMode(value as "CREATORS" | "URLS")}>
        {processingMode === "CREATORS" && (
          <>
          <details className="creator-selector">
            <summary>{selectedCreators.length} creator{selectedCreators.length === 1 ? "" : "s"} selected</summary>
            <div className="creator-menu">
              <SearchInput label="Search creators" placeholder="Search creators…" value={creatorSearch} onChange={(event) => setCreatorSearch(event.target.value)} />
              <div className="creator-options">{filteredCreators.map((source) => <label key={source.id} className={!source.enabled ? "disabled-source" : ""}><Input type="checkbox" checked={source.enabled && source.selectedByDefault} disabled={!source.enabled || isSavingSources} onChange={(event) => void saveSourceSelection(source.id, event.target.checked)} /><span>{source.name}<small>{source.platform}{!source.enabled ? " · Disabled" : ""}</small></span></label>)}</div>
              <form className="add-creator" onSubmit={addCreator}><label>Add YouTube channel<Input type="url" required placeholder="Paste YouTube channel URL" value={channelUrl} onChange={(event) => setChannelUrl(event.target.value)} /></label><Button type="submit" disabled={isSavingSources}>{isSavingSources ? "Saving…" : "Add creator"}</Button></form>
              {sourceMessage && <p className="source-message" role="status">{sourceMessage}</p>}
            </div>
          </details>
          {selectedCreators.length === 0 && <p className="episode-error">Select at least one creator before processing.</p>}
          <div className="processing-scope">
            <label>From<Input type="date" value={processingFromDate} onChange={(event) => setProcessingFromDate(event.target.value)} /></label>
            <label>To<Input type="date" value={processingToDate} onChange={(event) => setProcessingToDate(event.target.value)} /></label>
            <label>Max YouTube videos per creator<Input type="number" min="1" max={MAX_YOUTUBE_VIDEOS_PER_CREATOR} value={youtubeLimit} onChange={(event) => setYoutubeLimit(Number(event.target.value))} /></label>
            <p className="helper-text">Already processed episodes will be skipped. Maximum allowed: {MAX_YOUTUBE_VIDEOS_PER_CREATOR} per creator.</p>
          </div>
          <Button type="button" onClick={processEpisodes} disabled={Boolean(snapshot.loadError) || !processingFromDate || !processingToDate || selectedCreators.length === 0 || isSavingSources}>Start creator processing</Button>
          </>
        )}

        {processingMode === "URLS" && <div className="specific-video-panel">
          <div className="specific-video-content">
            <label>Paste one YouTube video URL per line
              <textarea rows={7} value={specificUrls} onChange={(event) => setSpecificUrls(event.target.value)} placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"} />
            </label>
            <p className="helper-text">{parsedUrls.length} URL{parsedUrls.length === 1 ? "" : "s"} detected · {validUrlCount} eligible · maximum {MAX_SPECIFIC_VIDEO_URLS}</p>
            {urlValidationError && <p className="episode-error">{urlValidationError}</p>}
            {parsedUrls.some((item) => item.status !== "VALID") && <ul className="url-validation-list">{parsedUrls.filter((item) => item.status !== "VALID").map((item) => <li key={item.lineNumber}><strong>Line {item.lineNumber} · {humanizeStatus(item.status)}:</strong> {item.submittedUrl} — {item.errorMessage}</li>)}</ul>}
            <Button type="button" onClick={() => void processSpecificUrls()} disabled={Boolean(urlValidationError) || validUrlCount === 0}>Process URLs</Button>
          </div>
        </div>}
          </Tabs>
        </div>}

        <div className="operations-run-context" aria-live="polite">
          <StatusBadge tone={snapshot.currentRunStatus === "COMPLETED" ? "success" : snapshot.currentRunStatus === "FAILED" || snapshot.currentRunStatus === "PARTIAL" ? "warning" : "neutral"}>{humanizeStatus(snapshot.currentRunStatus)}</StatusBadge>
          <span>Latest run started {formatRunDate(snapshot.lastRunAt)}</span>
          <span>{snapshot.completedCount} complete / {snapshot.failedCount} failed / {remainingCount} remaining</span>
          {snapshot.latestRunSources.length > 0 && <span>Creators: {snapshot.latestRunSources.map((source) => source.name).join(", ")}</span>}
          {snapshot.currentRunStatus === "CANCELLING" && <p>Stopping after the current safe operation. Saved work is retained.</p>}
          {snapshot.currentRunStatus === "CANCELLED" && <p>Run stopped. {snapshot.cancelledCount} episode(s) were not processed.</p>}
          {snapshot.runType === "SPECIFIC_URL_BATCH" && <p>{snapshot.batchSubmittedCount} URLs submitted / {snapshot.batchAlreadyProcessedCount} already processed / {snapshot.batchInvalidCount} invalid / {snapshot.batchDuplicateCount} duplicate</p>}
        </div>
      </section>}
      {view === "sources" && <ProcessingWorkspace snapshot={snapshot} busy={episodeActionId !== null || runIsActive} pendingEpisodeId={episodeActionId} onAction={controlEpisode} onRefresh={refreshSnapshot} actionError={actionError} />}

      {(view === "overview") && <section className="panel dashboard-instructions" aria-labelledby="instructions-heading">
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
          <Button type="button" onClick={() => void updateInstructions("PUT")} disabled={isSavingInstructions}>{isSavingInstructions ? "Saving…" : "Save"}</Button>
          <Button type="button" className="secondary-button" onClick={() => void updateInstructions("DELETE")} disabled={isSavingInstructions}>Reset to default</Button>
        </div>
        {instructionsMessage && <p className="source-message" role="status">{instructionsMessage}</p>}
        {instructionsError && <p className="episode-error" role="alert">{instructionsError}</p>}
      </section>}

      {(view === "overview" || view === "intelligence") && <section className="panel intelligence-panel" id="intelligence" aria-labelledby="latest-heading">
        <div className="section-heading compact-heading">
          <div><p className="section-number">Latest intelligence</p><h2 id="latest-heading">What creators are saying</h2></div>
          <p>{snapshot.recentEpisodes.length} episode{snapshot.recentEpisodes.length === 1 ? "" : "s"} · {snapshot.defaultPeriodLabel}</p>
        </div>
        <div className="chat-row">
          <label>From <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label>To <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          <Button type="button" className="secondary-button" onClick={() => void applyPeriod()} disabled={isFiltering || !fromDate || !toDate || fromDate > toDate}>{isFiltering ? "Filtering…" : "Apply dates"}</Button>
        </div>
        <p className="helper-text">Apply dates to browse stored episodes. Briefing generation is managed in Intelligence.</p>
        <h3>Filtered episodes</h3>
        <span className="anchor-target" id="content" aria-hidden="true" />
        {snapshot.recentEpisodes.length > 0 ? (
          <ul className="episode-list latest-list">{snapshot.recentEpisodes.map((episode) => <EpisodeStatus key={episode.episodeId} episode={episode} showSource dateRange={{ from: snapshot.defaultFromDate, to: snapshot.defaultToDate }} />)}</ul>
        ) : (
          <div className="empty-state"><p>No episodes found for this period.</p></div>
        )}
        <div className="run-report">
          <p className="summary-label">Synthesis</p>
          <div className="synthesis-actions">
            <a className="button-link secondary-button" href="/intelligence">View briefings in Intelligence</a>
            <p className="helper-text">Generate a publication-period briefing in Intelligence using saved insights.</p>
          </div>
          {(synthesisActionError || snapshot.synthesisAttemptError) && <div className="alert" role="alert">{synthesisActionError ?? snapshot.synthesisAttemptError} Review the date range or open Intelligence for briefing generation.</div>}
          {snapshot.synthesisScopeLabel && <p className="helper-text">Scope: {snapshot.synthesisScopeLabel}. {snapshot.synthesisEligibleCount} eligible episodes, {snapshot.synthesisIncludedCount} included, {snapshot.synthesisExcludedCount} excluded, {snapshot.synthesisDistinctCreatorCount} distinct creators. Generated {formatDisplayDate(snapshot.synthesisGeneratedAt)} with {snapshot.synthesisModel} · {snapshot.synthesisPromptVersion}.</p>}
          {snapshot.synthesisExcludedEpisodes.length > 0 && <div className="partial-note"><strong>Partial report:</strong> {snapshot.synthesisExcludedEpisodes.map((episode) => `${episode.sourceName} — ${episode.title}: ${episode.reason}`).join("; ")}</div>}
          {snapshot.runFailures.some((failure) => failure.stage === "SPLIT_DECISION_GENERATION") && <div className="partial-note"><strong>Derived-analysis warning:</strong> Some invalid split-decision candidates were discarded. The underlying episode insights remain included in synthesis.</div>}
          {snapshot.synthesisStale && <div className="partial-note"><strong>New processed content is available since this synthesis was generated.</strong> Open Intelligence to generate an updated briefing.</div>}
          {snapshot.synthesisInstructionsStale && <div className="partial-note"><strong>This report was created with older synthesis instructions.</strong> It remains unchanged until you explicitly regenerate it.</div>}
          {snapshot.reportError && <div className="alert" role="alert">Report display error: {snapshot.reportError}</div>}
          {snapshot.synthesis ? <>
            <h3 className="report-title">{snapshot.synthesis.title}</h3>
            <div className="report-overview">{snapshot.synthesis.overviewParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          </> : <div className="empty-state"><p>No synthesis has been generated for this period yet.</p></div>}
          {snapshot.synthesis && <p className="evidence-links">Evidence: {snapshot.synthesis.overviewSupportingInsightIds.map((id, index) => (
            <span key={id}>{index > 0 && ", "}<a href={`#insight-${id}`}>{insightById.get(id)?.sourceName ?? id}</a></span>
          ))}</p>}
          {snapshot.synthesis && REPORT_SECTION_KEYS.filter((key) => snapshot.synthesis!.sections[key].length > 0).map((key) => (
            <details className="report-section" key={key}>
              <summary><h3>{sectionLabels[key]}</h3><span>{snapshot.synthesis!.sections[key].length} finding{snapshot.synthesis!.sections[key].length === 1 ? "" : "s"}</span></summary>
              {snapshot.synthesis!.sections[key].length > 0 ? (
                <div className="report-items">{snapshot.synthesis!.sections[key].map((item, index) => (
                  <article className="report-item" key={`${key}-${index}`}>
                    {findingIsOwned(item.supportingInsightIds) && <span className="owned-marker">In your team</span>}
                    <span className={`interpretation interpretation-${item.interpretation.toLowerCase()}`}>{humanizeStatus(item.interpretation)}</span>
                    <span className={`sentiment sentiment-${item.sentiment.toLowerCase()}`}>{humanizeStatus(item.sentiment)}</span>
                    <h4>{item.subject}</h4>
                    <p>{item.summary}</p>
                    <p><strong>Why:</strong> {item.reasoning}</p>
                    <p className="insight-meta">{item.sourceCount} supporting creator{item.sourceCount === 1 ? "" : "s"}: {item.supportingCreatorNames.join(", ")}{item.timeHorizon ? ` · ${humanizeStatus(item.timeHorizon)} horizon` : ""}</p>
                    <p className="insight-meta">Attention: {item.attention.insightCount} insight{item.attention.insightCount === 1 ? "" : "s"} across {item.attention.episodeCount} episode{item.attention.episodeCount === 1 ? "" : "s"} · {item.attention.creatorCount} distinct creator{item.attention.creatorCount === 1 ? "" : "s"}</p>
                    {item.caveat && <p className="report-caveat"><strong>Caveat:</strong> {item.caveat}</p>}
                    <p className="evidence-links">Evidence: {item.supportingInsightIds.map((id, evidenceIndex) => (
                      <span key={id}>{evidenceIndex > 0 && ", "}{insightById.get(id) ? <a href={buildInsightSourceUrl(insightById.get(id)!.sourceUrl, insightById.get(id)!.timestampSeconds)} target="_blank" rel="noreferrer">{insightById.get(id)!.sourceName} — {insightById.get(id)!.episodeTitle} ({formatDisplayDate(insightById.get(id)!.publishedAt)}{getInsightPlaybackSeconds(insightById.get(id)!.timestampSeconds) == null ? "" : ` · from ${formatTimestamp(getInsightPlaybackSeconds(insightById.get(id)!.timestampSeconds)!)}`})</a> : "Source unavailable"}</span>
                    ))}</p>
                  </article>
                ))}</div>
              ) : <p className="no-findings">No material developments.</p>}
            </details>
          ))}
        </div>

        {snapshot.splitDecisions.length > 0 && (
          <div className="report-block">
            <h3>Split decisions</h3>
            {snapshot.splitDecisions.map((decision) => (
              <article className="split-card" key={decision.id}>
                {findingIsOwned(decision.positions.flatMap((position) => position.supportingInsightIds)) && <span className="owned-marker">In your team</span>}
                <h4>{decision.question}</h4>
                <div className="position-grid">{decision.positions.map((position) => (
                  <div key={`${decision.id}-${position.position}`}>
                    <h5>{position.position}</h5>
                    <p><strong>Supported by {position.creatorCount} distinct creator{position.creatorCount === 1 ? "" : "s"}:</strong> {position.creators.join(", ")}</p>
                    <p>{position.reasoning}</p>
                    <p className="evidence-links">Evidence: {position.supportingInsightIds.map((id, index) => {
                      const evidence = insightById.get(id);
                      return <span key={id}>{index > 0 && ", "}{evidence ? <a href={buildInsightSourceUrl(evidence.sourceUrl, evidence.timestampSeconds)} target="_blank" rel="noreferrer">{evidence.sourceName} — {evidence.episodeTitle}{getInsightPlaybackSeconds(evidence.timestampSeconds) == null ? "" : ` · from ${formatTimestamp(getInsightPlaybackSeconds(evidence.timestampSeconds)!)}`}</a> : id}</span>;
                    })}</p>
                  </div>
                ))}</div>
                {(decision.unresolvedQuestion || decision.implication) && <p className="unresolved"><strong>Unresolved / implication:</strong> {[decision.unresolvedQuestion, decision.implication].filter(Boolean).join(" ")}</p>}
              </article>
            ))}
          </div>
        )}
      </section>}

      {(view === "overview") && <section className="panel explore-panel" id="explore" aria-labelledby="entity-explorer-heading">
        <div className="my-team-entry"><div><p className="section-number">Your squad</p><h2>My FPL team</h2><p>See your latest public post-deadline squad and jump into recent creator research for each player.</p></div><a className="button-link" href="/squad">Open My Team</a></div>
        <div className="section-heading compact-heading"><div><p className="section-number">Browse</p><h2 id="entity-explorer-heading">Player and team insights</h2></div></div>
        <form className="entity-search" action="/entities" method="get"><Input type="hidden" name="range" value="30d" /><label htmlFor="dashboard-entity-query">Search stored entities</label><div><Input id="dashboard-entity-query" name="q" minLength={2} placeholder="Saka, Arsenal, Watkins…" /><Button type="submit">Search</Button></div></form>
        <p className="helper-text">Searches canonical player/team names and aliases. Default scope is Last 30 days and makes no OpenAI call.</p>
      </section>}

      {(view === "overview" || view === "ask") && <section className="panel research-panel" id="ask" aria-labelledby="research-heading">
        <div className="section-heading compact-heading"><div><p className="section-number">04</p><h2 id="research-heading">Ask FPL Research</h2></div></div>
        {researchAnswers.length > 0 && <div className="research-history" aria-live="polite">{researchAnswers.map((response, responseIndex) => (
          <article className="research-answer" key={`${response.question}-${responseIndex}`}>
            <p className="research-question">You asked: {response.question}</p>
            <p className="insight-meta">Searched: {response.scope.label}{response.analysis ? ` · ${response.analysis.reused ? "Reused saved analysis" : "Saved to My Analyses"}` : ""}</p>
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
              <li key={source.episodeId}><a href={buildInsightSourceUrl(source.sourceUrl, source.timestampSeconds)} target="_blank" rel="noreferrer">{source.episodeTitle}{getInsightPlaybackSeconds(source.timestampSeconds) == null ? "" : ` · from ${formatTimestamp(getInsightPlaybackSeconds(source.timestampSeconds)!)}`}</a><span>{source.sourceName} · {formatRunDate(source.publishedAt)}</span></li>
            ))}</ul></div>}
          </article>
        ))}</div>}
        <form onSubmit={askResearch}>
          <div className="research-scope">
            <label htmlFor="research-scope">Searching
              <Select id="research-scope" value={researchScope} onChange={(event) => setResearchScope(event.target.value as ResearchScopePreset)} disabled={isAsking}>
                <option value="THIS_WEEK">This week</option><option value="LAST_7_DAYS">Last 7 days</option>
                <option value="LAST_30_DAYS">Last 30 days</option><option value="THIS_SEASON">This season</option>
                <option value="ALL_HISTORY">All history</option><option value="CUSTOM">Custom</option>
              </Select>
            </label>
            {researchScope === "CUSTOM" && <>
              <label>From<Input type="date" value={researchFromDate} onChange={(event) => setResearchFromDate(event.target.value)} /></label>
              <label>To<Input type="date" value={researchToDate} onChange={(event) => setResearchToDate(event.target.value)} /></label>
            </>}
          </div>
          <label htmlFor="research-question">Question</label>
          <div className="chat-row">
            <Input id="research-question" type="text" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="Ask about your historical FPL research" disabled={isAsking} />
            <Button type="submit" disabled={isAsking || question.trim().length < 3 || (researchScope === "CUSTOM" && (!researchFromDate || !researchToDate))}>{isAsking ? "Researching…" : "Ask"}</Button>
          </div>
        </form>
        {researchError && <p className="episode-error" role="alert">{researchError}</p>}
        <p className="helper-text">Questions search the selected publication period. This week means Monday through Sunday in your local timezone.</p>
      </section>}
    </main>
  );
}
