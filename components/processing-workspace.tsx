"use client";

import { useState } from "react";
import Link from "next/link";
import type { DashboardSnapshot } from "@/lib/dashboard/types";
import type { EpisodeControlAction } from "@/lib/processing/episode-control";
import { episodeActions, processingItems, processingStatus, readableFailure, type ProcessingItem } from "@/lib/processing/presentation";
import { formatDisplayDate } from "@/lib/dates/display";
import { Button, EmptyState, StatusBadge } from "./ui/primitives";
import { Dialog, Pagination } from "./ui/interactive";

function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function attemptDate(value: string | null | undefined) { return formatDisplayDate(value, { dateStyle: "medium", timeStyle: "short" }, "Not recorded"); }

export function ProcessingMetrics({ snapshot }: { snapshot: DashboardSnapshot }) {
  const failed = snapshot.retryableEpisodes.filter((episode) => episode.status === "FAILED").length;
  const cancelled = snapshot.retryableEpisodes.filter((episode) => episode.status === "CANCELLED").length;
  return <dl className="operations-metrics" aria-label="Processing metrics">
    <div><dt>Sources</dt><dd>{snapshot.loadError ? "—" : snapshot.sourceLibrary.length}</dd><p>Total configured sources</p></div>
    <div><dt>Processed</dt><dd>{snapshot.loadError ? "—" : snapshot.completedCount}</dd><p>Successful episodes in latest run</p></div>
    <div><dt>Failed</dt><dd>{snapshot.loadError ? "—" : failed}</dd><p>Unresolved latest failed attempts{cancelled ? ` · ${cancelled} cancelled also need review` : ""}</p></div>
    <div><dt>Last sync</dt><dd className="metric-date">{snapshot.loadError ? "Unavailable" : snapshot.lastSuccessfulIngestionAt ? attemptDate(snapshot.lastSuccessfulIngestionAt) : "No successful run"}</dd><p>Last fully completed ingestion run</p></div>
  </dl>;
}

export function ProcessingWorkspace({ snapshot, busy, pendingEpisodeId, onAction, onRefresh, actionError }: { snapshot: DashboardSnapshot; busy: boolean; pendingEpisodeId: string | null; onAction: (episodeId: string, action: EpisodeControlAction) => Promise<boolean>; onRefresh: () => Promise<void>; actionError?: string | null }) {
  const items = processingItems(snapshot);
  const [selected, setSelected] = useState<ProcessingItem | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [actionPending, setActionPending] = useState<EpisodeControlAction | null>(null);
  const pageCount = Math.ceil(items.length / 20);
  const currentPage = Math.max(1, Math.min(page, pageCount || 1));
  const current = selected ? items.find((item) => item.key === selected.key) ?? selected : null;
  const statusFor = (item: ProcessingItem) => pendingEpisodeId && item.episode?.episodeId === pendingEpisodeId && ["FAILED", "CANCELLED", "PAUSED"].includes(item.status) ? { label: "Starting retry…", tone: "neutral" as const } : processingStatus(item.status);
  const manualRun = snapshot.runType === "MANUAL_EPISODE";
  async function act(action: EpisodeControlAction) {
    if (!current?.episode || (actionPending && !["CANCEL", "DISMISS"].includes(action))) return;
    setActionPending(action);
    try { if (await onAction(current.episode.episodeId, action) && action === "DISMISS") setSelected(null); }
    finally { setActionPending(null); }
  }
  return <section className="operations-list" aria-labelledby="operations-list-title">
    <div className="section-heading"><div><h2 id="operations-list-title">Processing activity</h2><p className="helper-text">Latest run items and unresolved attempts across all runs. Open an item for details and actions.</p></div><Button variant="secondary" loading={refreshing} onClick={async () => { setRefreshing(true); setRefreshError(false); try { await onRefresh(); } catch { setRefreshError(true); } finally { setRefreshing(false); } }}>Refresh status</Button></div>
    {refreshError && <p role="alert">Status could not be refreshed. Your saved work is retained; try again.</p>}
    {items.length === 0 ? <EmptyState title="No processing activity">Start a creator run or submit video URLs below. Completed work and history will remain saved.</EmptyState> : <>
      <div className="processing-table" role="table" aria-label="Processing activity"><div role="rowgroup" className="processing-table-head"><div role="row"><span role="columnheader">Source</span><span role="columnheader">Content</span><span role="columnheader">Status</span><span role="columnheader">Updated</span><span role="columnheader">Action</span></div></div><div role="rowgroup">{items.slice((currentPage - 1) * 20, currentPage * 20).map((item) => {
        const status = statusFor(item);
        return <div role="row" className="processing-table-row" key={item.key}>
          <span role="cell" className="processing-source" data-label="Source">{item.sourceName}</span>
          <span role="cell" data-label="Content"><button type="button" className="processing-title" onClick={() => setSelected(item)}>{item.title}</button>{item.batchLine && <small>URL line {item.batchLine}</small>}</span>
          <span role="cell" data-label="Status"><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{item.episode?.failureDismissedAt && <small>Dismissed from attention</small>}</span>
          <span role="cell" className="processing-updated" data-label="Updated" title="Attempt finished or started; no update time is invented">{attemptDate(item.updatedAt)}</span>
          <span role="cell" data-label="Action"><Button variant="secondary" onClick={() => setSelected(item)} aria-label={`Inspect ${item.title}`}>Inspect</Button></span>
        </div>;
      })}</div></div>
      <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
    </>}
    <Dialog open={current !== null} onClose={() => setSelected(null)} title="Processing item" className="processing-drawer">
      {current && <><h3 className="processing-drawer-title">{current.title}</h3><p>{current.sourceName}</p><StatusBadge tone={statusFor(current).tone}>{statusFor(current).label}</StatusBadge>
        <dl className="processing-detail-grid"><div><dt>Run / job ID</dt><dd>{current.runId ?? "Waiting for a persisted attempt"}</dd></div><div><dt>Current stage</dt><dd>{pendingEpisodeId === current.episode?.episodeId && ["FAILED", "CANCELLED", "PAUSED"].includes(current.status) ? "Starting retry; waiting for persisted status" : humanize(current.stage)}</dd></div><div><dt>Last attempt started</dt><dd>{attemptDate(current.episode?.attemptStartedAt)}</dd></div><div><dt>Attempt finished</dt><dd>{attemptDate(current.episode?.attemptCompletedAt)}</dd></div><div><dt>Retry count</dt><dd>{current.episode?.retryCount ?? "Not applicable"}</dd></div></dl>
        {current.sourceUrl && <p><a href={current.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a><br /><span className="helper-text">{current.sourceUrl}</span></p>}
        {!current.sourceUrl && current.submittedUrl && <p>Submitted URL: <span className="helper-text">{current.submittedUrl}</span></p>}
        {(current.errorMessage || current.status === "CANCELLED") && <p>{readableFailure(current.stage, current.status)}</p>}
        {current.episode?.failureDismissedAt && <p>Dismissed from active attention. The actual {humanize(current.status).toLowerCase()} status, transcript and attempt history are retained.</p>}
        {current.errorMessage && <details className="technical-details"><summary>Technical details</summary><pre>{current.errorMessage}</pre></details>}
        {actionError && <><p role="alert">The action could not be completed. Saved work is retained; check the details and try again.</p><details className="technical-details"><summary>Action technical details</summary><pre>{actionError}</pre></details></>}
        {snapshot.currentRunStatus === "CANCELLING" && current.runId === snapshot.latestRunId && <p role="status">Cancellation requested. The current safe step may finish; no next expensive stage will start.</p>}
        <div className="processing-detail-actions">{current.episode && episodeActions(current.episode, busy, manualRun && current.runId === snapshot.latestRunId).map(({ action, label, disabled }) => <Button key={action} variant={action === "RETRY" || action === "RESUME" ? "primary" : "secondary"} disabled={disabled || (actionPending !== null && !["CANCEL", "DISMISS"].includes(action)) || (action === "CANCEL" && snapshot.currentRunStatus === "CANCELLING")} loading={actionPending === action && action !== "RETRY" && action !== "RESUME"} onClick={() => void act(action)}>{pendingEpisodeId === current.episode?.episodeId && (action === "RETRY" || action === "RESUME") ? "Retrying…" : label}</Button>)}{current.episode && <Link className="button-link secondary-button" href={`/episodes/${current.episode.episodeId}`}>View episode</Link>}</div>
        {manualRun && busy && <p className="helper-text">Cancellation is cooperative. A running transcript or extraction request may finish and save its result.</p>}
      </>}
    </Dialog>
  </section>;
}
