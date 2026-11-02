"use client";

import { useShowcaseAction } from "@/components/showcase-action-gate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, StatusBadge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/interactive";
import { latestSevenLocalDates, localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";
import { formatDisplayDate } from "@/lib/dates/display";
import { buildInsightSourceUrl, buildYouTubeTimestampUrl, formatTimestamp, getInsightPlaybackSeconds } from "@/lib/episodes/presentation";
import { REPORT_SECTION_KEYS } from "@/lib/summaries/schema";
import { humanize } from "@/lib/intelligence/filters";
import type { Briefing } from "@/lib/intelligence/briefing";

type State = "idle" | "generating" | "completed" | "failed" | "empty";
const labels: Record<typeof REPORT_SECTION_KEYS[number], string> = { teamsToTarget: "Teams to target", teamsToAvoid: "Teams to avoid", playersToBuy: "Transfers in", playersToSell: "Transfers out", mostDiscussedPlayers: "Most discussed players", fixtureSwings: "Fixture swings", chipStrategy: "Chips and wildcard", undervaluedPlayers: "Value picks", overpricedPlayers: "Poor value", watchlist: "Watchlist" };

export function BriefingWorkspace({ initialPeriod, initialOffset, regenerate = false }: { initialPeriod?: { from: string; to: string }; initialOffset?: number; regenerate?: boolean } = {}) {
  const showcase=useShowcaseAction();
  const router = useRouter();
  const timezoneOffset = useCallback(() => initialOffset ?? new Date().getTimezoneOffset(), [initialOffset]);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initialPeriod?.from ?? ""); const [to, setTo] = useState(initialPeriod?.to ?? "");
  const [state, setState] = useState<State>("idle");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [reused, setReused] = useState(false);
  const requestVersion = useRef(0); const inFlight = useRef(false);
  useEffect(() => {
    if (!open || !from || !to || from > to || inFlight.current) return;
    const version = ++requestVersion.current; const abort = new AbortController();
    const timer = setTimeout(async () => {
      if (inFlight.current || version !== requestVersion.current) return;
      setChecking(true); setError(null);
      try {
        const params = new URLSearchParams({ from, to, tz: String(timezoneOffset()) });
        const response = await fetch(`/api/syntheses?${params}`, { signal: abort.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load stored briefing.");
        if (version === requestVersion.current) { setBriefing(body.briefing); setState(body.briefing ? "completed" : "idle"); setReused(false); }
      } catch (error) { if (!abort.signal.aborted && version === requestVersion.current) { setError(error instanceof Error ? error.message : "Unable to load stored briefing."); setState("failed"); } }
      finally { if (version === requestVersion.current) setChecking(false); }
    }, 150);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [open, from, to, timezoneOffset]);

  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (showcase.block(regenerate ? "Regenerate briefing" : "Generate briefing")) return; if (inFlight.current) return;
    try { localDateRangeToUtcBounds(from, to, timezoneOffset()); }
    catch (error) { setError(error instanceof Error ? error.message : "Choose valid dates."); setState("failed"); return; }
    inFlight.current = true; ++requestVersion.current; setChecking(false); setState("generating"); setError(null); setReused(false);
    try {
      const response = await fetch("/api/syntheses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "DATE_RANGE", fromDate: from, toDate: to, timezoneOffsetMinutes: timezoneOffset() }) });
      const result = await response.json();
      if (result.code === "NO_ELIGIBLE_CONTENT") { setState("empty"); setBriefing(null); return; }
      if (!response.ok) throw new Error(result.error ?? "Briefing generation failed.");
      const stored = await fetch(`/api/syntheses?${new URLSearchParams({ from, to, id: result.synthesisId })}`, { cache: "no-store" });
      const body = await stored.json();
      if (!stored.ok || !body.briefing) throw new Error(body.error ?? "The briefing was saved, but could not be displayed. Reopen this period to load it.");
      setBriefing(body.briefing); setReused(Boolean(result.reused)); setState("completed");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Briefing generation failed."); setState("failed"); }
    finally { inFlight.current = false; }
  }
  return <section className="briefing-workspace" aria-labelledby="briefing-heading">
    <div className="section-heading"><div><h2 id="briefing-heading">Your research briefing</h2><p className="helper-text">Synthesize a publication period across creators using saved insights and source evidence.</p></div><Button disabled={state === "generating"} onClick={() => {
      if (showcase.block(regenerate ? "Regenerate briefing" : "Generate briefing")) return;
      if (!from || !to) { const period = latestSevenLocalDates(new Date(), timezoneOffset()); setFrom(period.fromDate); setTo(period.toDate); }
      setOpen(true);
    }}>{regenerate ? "Regenerate" : "Generate briefing"}</Button></div>
    {state === "generating" && <p role="status">Generating briefing from saved insights. This may take a few minutes.</p>}
    {briefing && state !== "generating" && <BriefingReport briefing={briefing} reused={reused} />}
    <Dialog open={open} onClose={() => setOpen(false)} title={regenerate ? "Regenerate briefing" : "Generate briefing"} className="briefing-dialog">
      <p>Defaults to the last seven publication days. This period includes all creators and is independent of the feed filters.</p>
      <form onSubmit={(event) => void generate(event)} className="briefing-form">
        <div className="briefing-dates"><label>Date from<Input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} disabled={state === "generating"} /></label><label>Date to<Input type="date" required value={to} onChange={(event) => setTo(event.target.value)} disabled={state === "generating"} /></label></div>
        <p className="helper-text">Unchanged evidence, period and prompt/model versions reuse a valid saved briefing. New or changed evidence allows a new generation. No transcripts are reprocessed. Earlier report versions are preserved.</p>
        <div role="status" className="briefing-state">{checking ? "Checking stored briefings…" : state === "generating" ? "Generating…" : state === "completed" && briefing?.from === from && briefing.to === to ? reused ? "Completed — reused saved briefing." : "Stored briefing available for this period." : state === "empty" ? "No eligible content" : state === "failed" ? "Failed" : "Ready to generate"}</div>
        {state === "empty" && <p>No episodes with a saved transcript and extracted insights match this period. Choose different dates or <Link href="/sources">check Sources</Link>.</p>}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" loading={state === "generating"} disabled={checking || !from || !to || from > to}>{state === "generating" ? "Generating…" : regenerate ? "Regenerate" : "Generate"}</Button>
      </form>
    </Dialog>
  </section>;
}

export function BriefingReport({ briefing, reused = false }: { briefing: Briefing; reused?: boolean }) {
  const evidence = new Map(briefing.insights.map((item) => [item.id, item]));
  function citations(ids: string[]) {
    return <ul className="briefing-citations">{ids.map((id) => { const item = evidence.get(id); if (!item) return <li key={id}>Source evidence unavailable</li>;
      const seconds = getInsightPlaybackSeconds(item.timestampSeconds);
      const timed = seconds != null && buildYouTubeTimestampUrl(item.sourceUrl, seconds) !== null;
      return <li key={id}><Link href={`/episodes/${item.episodeId}?returnTo=%2Fintelligence`}>{item.sourceName} — {item.episodeTitle}</Link><span> · {formatDisplayDate(item.publishedAt)} · </span><a href={buildInsightSourceUrl(item.sourceUrl, item.timestampSeconds)} target="_blank" rel="noreferrer">{timed ? `Play from ${formatTimestamp(seconds!)}` : "Original source"}</a></li>;
    })}</ul>;
  }
  return <article className="briefing-report" aria-label="Stored briefing">
    <StatusBadge tone="success">{reused ? "Saved briefing reused" : "Stored briefing"}</StatusBadge><h3>{briefing.summary.title}</h3>
    <p className="helper-text">{briefing.scopeType === "RUN" ? "Processing-run scope" : `${briefing.from} to ${briefing.to}`} · Generated {formatDisplayDate(briefing.generatedAt, { dateStyle: "medium", timeStyle: "short" })} · {briefing.episodeIds.length} episode{briefing.episodeIds.length === 1 ? "" : "s"} · {briefing.distinctCreatorCount ?? briefing.sourceIds.length} creator{(briefing.distinctCreatorCount ?? briefing.sourceIds.length) === 1 ? "" : "s"}</p>
    {briefing.includedInsightCount != null && <p className="helper-text">{briefing.includedInsightCount} input insights</p>}
    {briefing.excludedEpisodeCount > 0 && <p className="helper-text">{briefing.excludedEpisodeCount} episode(s) lacked eligible saved content when this briefing was created.</p>}
    <div className="briefing-overview">{briefing.summary.overviewParagraphs.map((text, index) => <p key={index}>{text}</p>)}</div>{citations(briefing.summary.overviewSupportingInsightIds)}
    {REPORT_SECTION_KEYS.filter((key) => briefing.summary.sections[key].length > 0).map((key) => <details key={key} className="briefing-section"><summary>{labels[key]} <span>({briefing.summary.sections[key].length})</span></summary>{briefing.summary.sections[key].map((item, index) => <section key={index} className="briefing-finding"><StatusBadge>{humanize(item.interpretation)}</StatusBadge><h4>{item.subject}</h4><p>{item.summary}</p><p><strong>Why:</strong> {item.reasoning}</p><p className="helper-text">{item.sourceCount} distinct supporting creator{item.sourceCount === 1 ? "" : "s"}: {item.supportingCreatorNames.join(", ")}</p>{item.caveat && <p>{item.caveat}</p>}{citations(item.supportingInsightIds)}</section>)}</details>)}
    {briefing.splits.length > 0 && <section className="briefing-splits"><h4>Split decisions</h4>{briefing.splits.map((split) => <div key={split.id}><h4>{split.question}</h4>{split.positions.map((position, index) => <section key={index}><strong>{position.position}</strong><p>{position.reasoning}</p><p className="helper-text">{position.creatorCount} creator{position.creatorCount === 1 ? "" : "s"}: {position.creators.join(", ")}</p>{citations(position.supportingInsightIds)}</section>)}<p>{[split.unresolvedQuestion, split.implication].filter(Boolean).join(" ")}</p></div>)}</section>}
    <details className="technical-details"><summary>Briefing metadata</summary><dl><dt>Evidence window (UTC, exclusive end)</dt><dd>{briefing.bounds ? `${briefing.bounds.startInclusive} to ${briefing.bounds.endExclusive}` : "Not recorded"}</dd><dt>Model</dt><dd>{briefing.model}</dd><dt>Prompt version</dt><dd>{briefing.promptVersion}</dd><dt>Pipeline version</dt><dd>{briefing.pipelineVersion ?? "Not recorded for this historical briefing"}</dd><dt>Generation mode</dt><dd>{humanize(briefing.mode)}</dd><dt>Included source IDs</dt><dd>{briefing.sourceIds.join(", ") || "Not recorded"}</dd><dt>Included episode IDs</dt><dd>{briefing.episodeIds.join(", ")}</dd></dl></details>
  </article>;
}
