import { getAppCapabilities } from "@/lib/app-config";
import Link from "next/link";
import { Button, EmptyState, Input, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDisplayDate } from "@/lib/dates/display";
import { buildInsightSourceUrl, buildYouTubeTimestampUrl, formatTimestamp, getInsightPlaybackSeconds } from "@/lib/episodes/presentation";
import { DECISION_SHORTCUTS, OVERVIEW_PROMPTS, researchQuestionHref } from "@/lib/research/navigation";
import type { OverviewData } from "@/lib/overview/data";
import type { OverviewFinding } from "@/lib/overview/presentation";

function humanize(value: string) { return value === "YOUTUBE" ? "YouTube" : value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

function Finding({ finding, claims }: { finding: OverviewFinding; claims: boolean }) {
  return <article className="overview-finding" data-testid="overview-finding" data-creator-count={finding.creators.length}>
    <div className="overview-finding-meta"><span>{humanize(finding.category)}</span><StatusBadge>{finding.label}</StatusBadge>{finding.inYourTeam && <span className="overview-owned">In your team</span>}</div>
    <h3>{finding.headline}</h3>
    {claims && <p className="overview-claim-attribution">Latest claim from {finding.evidence[0].creator}</p>}
    <p className="overview-finding-explanation">{finding.explanation}</p>
    <p className="overview-finding-breadth">{finding.breadthLabel}</p>
    {finding.entities.length > 0 && <p className="overview-related"><span>Related: </span>{finding.entities.map((entity, index) => <span key={entity.id ?? `${entity.type}:${entity.name}`}>{index > 0 && " · "}{entity.id ? <Link prefetch={false} href={`/entities/${entity.id}?range=7d`}>{entity.name}</Link> : entity.name}</span>)}</p>}
    <div className="overview-finding-footer"><span>Latest evidence <time dateTime={finding.latestEvidenceAt}>{formatDisplayDate(finding.latestEvidenceAt)}</time></span><Link prefetch={false} href={`/episodes/${finding.evidence[0].episodeId}`}>Inspect evidence →</Link></div>
    <details className="overview-evidence"><summary>View source evidence ({finding.evidence.length})</summary><ul>{finding.evidence.map((item) => {
      const seconds = getInsightPlaybackSeconds(item.timestampSeconds); const timed = seconds != null && buildYouTubeTimestampUrl(item.sourceUrl, seconds) !== null;
      return <li key={item.insightId}><Link prefetch={false} href={`/episodes/${item.episodeId}`}>{item.creator} — {item.episodeTitle}</Link><span> · {formatDisplayDate(item.publishedAt)} · </span><a href={buildInsightSourceUrl(item.sourceUrl, item.timestampSeconds)} target="_blank" rel="noreferrer">{timed ? `Play from ${formatTimestamp(seconds!)}` : "Original source"}</a></li>;
    })}</ul></details>
  </article>;
}

export function Overview({ data }: { data: OverviewData }) {
  return <main className="overview-shell" id="main-content">
    <PageHeader title="Your FPL briefing" description="The opinions, updates and decisions that matter right now." className="overview-header" actions={data.updatedAt ? <div className="overview-updated"><span>Intelligence last updated</span><time dateTime={data.updatedAt}>{formatDisplayDate(data.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</time></div> : undefined} />
    <section className="overview-briefing" aria-labelledby="what-matters-heading">
      <div className="section-heading"><div><p className="eyebrow">The research, in focus</p><h2 id="what-matters-heading">What you need to know</h2></div><Link prefetch={false} href="/intelligence">Open Intelligence →</Link></div>
      <p className="overview-period">{data.briefing ? `${data.briefing.from} to ${data.briefing.to} · Stored briefing` : `${data.period.fromDate} to ${data.period.toDate} · Last seven publication days`}{data.briefingGeneratedAt ? ` · Generated ${formatDisplayDate(data.briefingGeneratedAt, { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
      {data.briefing && <><StatusBadge tone={data.briefing.freshness === "stale" ? "warning" : "neutral"}>{data.briefing.freshness === "stale" ? "Stale · saved evidence has changed" : getAppCapabilities().mode === "public_read_only" ? "Latest published briefing" : data.briefing.from === data.period.fromDate && data.briefing.to === data.period.toDate ? "Current period" : "Latest overlapping briefing"}</StatusBadge>
        {(data.briefing.from !== data.period.fromDate || data.briefing.to !== data.period.toDate) && <p className="helper-text">This briefing covers the dates above. Overview’s current window is {data.period.fromDate} to {data.period.toDate}.</p>}
        <p><Link prefetch={false} href={`/intelligence/briefings/${data.briefing.id}`}>Open full briefing →</Link></p>
        {!data.findings.length && data.briefing.overview.map((text, index) => <p key={index}>{text}</p>)}
      </>}
      {data.briefingUnavailable && <p className="overview-notice" role="status">Some saved research is temporarily unavailable. Showing the evidence available now.</p>}
      {data.mode === "claims" && !data.briefing && <div className="overview-notice"><p>{data.briefingUnavailable ? "Showing stored creator claims while the saved briefing is unavailable." : data.briefingGeneratedAt ? "The saved briefing has no citable findings for this period." : "No briefing has been generated for the current period yet."}</p><p>These are stored creator claims, grouped by topic. Discussion breadth is separate from agreement. <Link prefetch={false} href="/intelligence">Explore Intelligence →</Link></p></div>}
      {data.findings.length ? <div className="overview-findings">{data.findings.map((finding) => <Finding key={finding.id} finding={finding} claims={data.mode === "claims"} />)}</div> : data.briefing ? null : <EmptyState title={data.briefingUnavailable ? "Saved briefing is temporarily unavailable" : data.briefingGeneratedAt ? "No citable findings are available for the current period." : "No briefing has been generated for the current period yet."} action={<Link prefetch={false} className="button-link" href="/intelligence">Explore Intelligence</Link>}>Browse saved episodes and briefings in Intelligence. No research is generated automatically here.</EmptyState>}
    </section>

    <><nav className="overview-shortcuts" aria-label="Decision shortcuts">{DECISION_SHORTCUTS.filter((shortcut) => shortcut.href !== "/squad" || getAppCapabilities().canViewSquad).map((shortcut) => <Link prefetch={false} key={shortcut.label} href={shortcut.href}><strong>{shortcut.label}<span aria-hidden="true">→</span></strong><span>{shortcut.description}</span></Link>)}</nav>

    <section className="overview-ask" aria-labelledby="overview-ask-heading"><div><p className="eyebrow">Follow the evidence</p><h2 id="overview-ask-heading">Ask FPL Research</h2><p>Ask a question across the saved creator research.</p></div><form action="/ask" method="get"><label htmlFor="overview-question" className="sr-only">Your FPL research question</label><div className="overview-question-row"><Input id="overview-question" name="q" type="text" required minLength={3} maxLength={1000} placeholder="Who should I captain this gameweek?" /><Button type="submit">Ask FPL Research →</Button></div></form><div className="overview-prompts" aria-label="Suggested questions">{OVERVIEW_PROMPTS.map((prompt) => <Link prefetch={false} key={prompt} href={researchQuestionHref(prompt)}>{prompt}</Link>)}</div><p className="helper-text">Opens Ask AI with your question ready to review.</p></section>

    </>
    <section className="overview-latest" aria-labelledby="latest-creator-heading"><div className="section-heading"><h2 id="latest-creator-heading">Latest creator intelligence</h2><Link prefetch={false} href="/intelligence">View all intelligence →</Link></div><p className="helper-text">Latest successfully processed episodes, newest first.</p>
      {data.latestUnavailable ? <p role="status">Latest creator intelligence is temporarily unavailable. <Link prefetch={false} href="/intelligence">Browse Intelligence</Link>.</p> : data.latestEpisodes.length ? <ul>{data.latestEpisodes.map((episode) => <li key={episode.id} data-testid="overview-latest-episode" data-published-at={episode.publishedAt}><div className="overview-latest-meta"><span>{episode.creator}</span><span>{humanize(episode.platform)}</span><time dateTime={episode.publishedAt}>{formatDisplayDate(episode.publishedAt)}</time></div><div className="overview-latest-title"><h3><Link prefetch={false} href={`/episodes/${episode.id}`}>{episode.title}</Link></h3><Link prefetch={false} href={`/episodes/${episode.id}`} aria-label={`Inspect ${episode.title}`}>Inspect →</Link></div>{episode.claimExcerpt && <p><span className="overview-excerpt-label">Extracted claim:</span> {episode.claimExcerpt}</p>}</li>)}</ul> : <EmptyState title="No processed creator content yet" action={<Link prefetch={false} href="/intelligence">Open Intelligence</Link>}>Successfully processed episodes will appear here with their source evidence.</EmptyState>}
    </section>
  </main>;
}
