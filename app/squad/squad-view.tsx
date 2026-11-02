"use client";
import { useShowcaseAction, ShowcaseActionGate } from "@/components/showcase-action-gate";
import { useCapabilities } from "@/components/app-capabilities";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/primitives";
import { ResearchAnswer } from "@/app/ask/workspace";
import { SQUAD_RESEARCH_ACTIONS } from "@/lib/research/navigation";
import type { FplSquadPageRefreshResult, StoredFplSquad } from "@/lib/fpl-entry/types";
import type { SquadIntelligence, SquadPlayerIntelligence } from "@/lib/fpl-entry/intelligence";
import type { ResearchResponse } from "@/lib/research/schema";
import { formatDisplayDate } from "@/lib/dates/display";
import { buildInsightSourceUrl, formatTimestamp, getInsightPlaybackSeconds } from "@/lib/episodes/presentation";
import { SquadPitch } from "./squad-pitch";
import type { SquadFixtureCalendar } from "@/lib/fpl/fixture-runs";

export default function SquadView({ entryId, initialSquad, initialMessage, initialIntelligence, fixtureCalendar }: { entryId: number | null; initialSquad: StoredFplSquad | null; initialMessage: string | null; initialIntelligence: SquadIntelligence | null; fixtureCalendar: SquadFixtureCalendar }) {
  const showcase=useShowcaseAction(); const capabilities=useCapabilities();
  const router = useRouter();
  const [squad, setSquad] = useState(initialSquad); const [message, setMessage] = useState(initialMessage); const [busy, setBusy] = useState(false);
  const [calendar, setCalendar] = useState(fixtureCalendar);
  const [question, setQuestion] = useState(""); const [asking, setAsking] = useState(false); const [chatError, setChatError] = useState<string | null>(null); const [answers, setAnswers] = useState<ResearchResponse[]>([]);
  async function refresh() {
    if(showcase.block("Refresh My Squad")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/fpl-squad", { method: "POST" }); const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Refresh failed.");
      const result = body as FplSquadPageRefreshResult;
      setCalendar(result.fixtureCalendar);
      const fixtureMessage = result.fixtureRefreshError ? ` Fixtures could not be refreshed: ${result.fixtureRefreshError}` : " Official fixtures refreshed.";
      if (result.availability === "PUBLIC_PICKS") { setSquad(result.squad); setMessage(`Gameweek ${result.squad.gameweek} public picks refreshed.${fixtureMessage}`); }
      else if (result.availability === "STALE_PUBLIC_PICKS") { setSquad(result.squad); setMessage(`Refresh failed. Showing the last saved public squad. ${result.message}${fixtureMessage}`); }
      else { setSquad(result.latestSquad); setMessage(`${result.message}${fixtureMessage}`); }
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Refresh failed."); }
    finally { setBusy(false); }
  }
  async function askTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (question.trim().length < 3 || asking) return;
    if(showcase.block("Ask AI")) return;
    setAsking(true); setChatError(null);
    try {
      const response = await fetch("/api/research-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim(), scope: "LAST_14_DAYS", contextMode: "MY_TEAM", timezoneOffsetMinutes: new Date().getTimezoneOffset() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to research your team.");
      setAnswers((current) => [...current, body as ResearchResponse]); setQuestion("");
    } catch (error) { setChatError(error instanceof Error ? error.message : "Unable to research your team."); }
    finally { setAsking(false); }
  }
  return <main id="main-content" className="dashboard-shell detail-shell squad-shell">
    <header className="dashboard-hero"><div><p className="eyebrow">Personal squad</p><h1>My Squad</h1><p>Latest publicly available post-deadline picks with the official upcoming fixture calendar.</p></div><div className="hero-actions"><Button onClick={refresh} loading={busy} disabled={entryId === null && capabilities.canRefreshFpl}>Refresh team & fixtures</Button>{!capabilities.canWriteData && <ShowcaseActionGate action="Change FPL entry" description="Choose and save your own FPL entry in the full local application."><Button variant="secondary">Change FPL entry</Button></ShowcaseActionGate>}{entryId && <p>Entry {entryId}</p>}</div></header>
    {message && <p className={squad?.stale ? "error-text" : "empty-state"} role="status">{message}</p>}
    {!squad ? <section className="panel"><h2>No public squad available yet</h2><p>FPL only publishes an entry’s Gameweek picks after that Gameweek deadline. Refresh after the deadline; no login or private team access is used.</p></section> : <>
      <section className="panel squad-summary"><div><p className="eyebrow">Latest publicly available</p><h2>{squad.entry.entryName} · Gameweek {squad.gameweek}</h2><p>{squad.entry.managerName}{squad.activeChip ? ` · ${squad.activeChip}` : ""}</p><p className="freshness">Squad updated: {formatFreshness(squad.retrievedAt)} · FPL data updated: {formatFreshness(squad.fplDataUpdatedAt)}</p></div><div><strong>{squad.eventPoints ?? "—"}</strong><span>GW points</span></div><div><strong>{squad.totalPoints ?? "—"}</strong><span>Total points</span></div></section>
      <SquadPitch picks={squad.picks} fixtureCalendar={calendar} />
      <nav className="squad-research-actions" aria-label="Squad research actions">{SQUAD_RESEARCH_ACTIONS.map((item) => <Link prefetch={false} className="button-link secondary-button" key={item.label} href={item.href}>{item.label}</Link>)}</nav>
      <TeamIntelligence intelligence={initialIntelligence} />
      <section className="panel team-chat" aria-labelledby="team-chat-heading"><div className="section-heading compact-heading"><div><p className="section-number">Squad research</p><h2 id="team-chat-heading">Ask about your team</h2></div></div><p>Questions start with your current 15-player squad and the last 14 days of stored creator evidence. Replacement questions may expand to comparable players you do not own.</p>
        {answers.map((response, index) => <ResearchAnswer response={response} mode="MY_TEAM" key={index} />)}
        <form onSubmit={askTeam}><label htmlFor="team-question">Question about your current squad</label><div className="chat-row"><Input id="team-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="What are the biggest risks in my team?" disabled={asking || !initialIntelligence} /><Button type="submit" loading={asking} disabled={question.trim().length < 3 || !initialIntelligence}>Ask</Button></div></form>{chatError && <p className="episode-error" role="alert">{chatError}</p>}
      </section>
    </>}
  </main>;
}
function formatFreshness(value: string | null) { if (!value) return "Not available"; const date=new Date(value); return Number.isNaN(date.getTime())?"Not available":new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(date); }

function TeamIntelligence({ intelligence }: { intelligence: SquadIntelligence | null }) {
  if (!intelligence) return <section className="panel"><h2>Latest intelligence about your team</h2><p className="empty-state">Refresh and save a public squad before loading team intelligence.</p></section>;
  const rows = [
    ["Creators are positive on", intelligence.recommended], ["Creators are questioning", intelligence.questioned],
  ] as const;
  return <section className="panel team-intelligence" aria-labelledby="team-intelligence-heading"><div className="section-heading compact-heading"><div><p className="section-number">Last 14 days</p><h2 id="team-intelligence-heading">Latest intelligence about your team</h2></div></div>
    {intelligence.players.every((item) => item.insightCount === 0) ? <div className="empty-state"><p>No stored creator insights concern your current squad in the last 14 days.</p></div> : <>
      <div className="team-status-grid">{rows.map(([title, items]) => <StatusGroup key={title} title={title} items={items} />)}<StatusGroup title="Most discussed" items={intelligence.mostDiscussed} /></div>
      {intelligence.risks.length > 0 && <div className="team-intelligence-list"><h3>Minutes, injury and decision risks</h3>{intelligence.risks.slice(0, 5).map((insight) => <article key={`${insight.id}-${insight.entityId}`}><span className="owned-marker">In your team</span><strong>{insight.playerName}: {insight.claim}</strong><p>{insight.reasoning}</p><a href={buildInsightSourceUrl(insight.sourceUrl, insight.timestampSeconds)} target="_blank" rel="noreferrer">{insight.sourceName} · {insight.episodeTitle} · {formatDisplayDate(insight.publishedAt)}{getInsightPlaybackSeconds(insight.timestampSeconds) == null ? "" : ` · from ${formatTimestamp(getInsightPlaybackSeconds(insight.timestampSeconds)!)}`}</a></article>)}</div>}
      {intelligence.captaincy.length > 0 && <div className="team-intelligence-list"><h3>Captaincy mentions</h3>{intelligence.captaincy.slice(0, 4).map((insight) => <article key={`${insight.id}-${insight.entityId}`}><strong>{insight.playerName}: {insight.claim}</strong><p><a href={buildInsightSourceUrl(insight.sourceUrl, insight.timestampSeconds)} target="_blank" rel="noreferrer">{insight.sourceName} · {formatDisplayDate(insight.publishedAt)}{getInsightPlaybackSeconds(insight.timestampSeconds) == null ? "" : ` · from ${formatTimestamp(getInsightPlaybackSeconds(insight.timestampSeconds)!)}`}</a></p></article>)}</div>}
      {intelligence.splitQuestions.length > 0 && <div className="team-intelligence-list"><h3>Split opinions</h3><ul>{intelligence.splitQuestions.map((question) => <li key={question}>{question}</li>)}</ul></div>}
    </>}
    {intelligence.noCoverage.length > 0 && <p className="helper-text"><strong>No recent coverage:</strong> {intelligence.noCoverage.map((item) => item.player.webName).join(", ")}.</p>}
  </section>;
}
function StatusGroup({ title, items }: { title: string; items: SquadPlayerIntelligence[] }) {
  return <div><h3>{title}</h3>{items.length ? <ul>{items.slice(0, 6).map((item) => <li key={item.player.fplPlayerId}><a href={item.player.entityId ? `/entities/${item.player.entityId}?range=14d&owned=1` : `/players?q=${item.player.fplPlayerId}&range=14d`}>{item.player.webName}</a><span>{item.status.toLowerCase().replaceAll("_", " ")} · {item.creatorCount} creator{item.creatorCount === 1 ? "" : "s"} · {item.insightCount} insight{item.insightCount === 1 ? "" : "s"}</span></li>)}</ul> : <p className="helper-text">None in this period.</p>}</div>;
}
