import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDisplayDate } from "@/lib/dates/display";
import { buildInsightSourceUrl, buildYouTubeTimestampUrl, dateScopeQuery, formatTimestamp, getInsightPlaybackSeconds } from "@/lib/episodes/presentation";
import { getEpisodeDetail } from "@/lib/episodes/repository";
import { intelligenceReturnUrl } from "@/lib/intelligence/filters";
import { Button, Select } from "@/components/ui/primitives";

export const metadata = { title: "Episode research | FPL Research", description: "Inspect extracted creator insights and timestamped source evidence." };
export const dynamic = "force-dynamic";

function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function value(search: Record<string, string | string[] | undefined>, key: string) { const item = search[key]; return Array.isArray(item) ? item[0] ?? "" : item ?? ""; }

export default async function EpisodePage({ params, searchParams }: {
  params: Promise<{ episodeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ episodeId }, search] = await Promise.all([params, searchParams]);
  const episode = await getEpisodeDetail(episodeId);
  if (!episode) notFound();
  const category = value(search, "category");
  const recommendation = value(search, "recommendation");
  const entityId = value(search, "entity");
  const from = value(search, "from");
  const to = value(search, "to");
  const categories = [...new Set(episode.insights.map((item) => item.category))].sort();
  const recommendations = [...new Set(episode.insights.map((item) => item.recommendation))].sort();
  const entities = [...new Map(episode.insights.flatMap((item) => item.entities).map((entity) => [entity.id, entity])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const visibleInsights = episode.insights.filter((item) => (!category || item.category === category) && (!recommendation || item.recommendation === recommendation) && (!entityId || item.entities.some((entity) => entity.id === entityId)));
  const scopeQuery = dateScopeQuery(from, to);
  const returnTo = intelligenceReturnUrl(value(search, "returnTo"));
  const contextParams = new URLSearchParams(scopeQuery.slice(1));
  if (returnTo) contextParams.set("returnTo", returnTo);
  const detailQuery = contextParams.size ? `?${contextParams}` : "";

  return <main className="detail-shell">
    {episode.evidenceLimited && <p className="helper-text">Showing the first 100 stored claims from this episode. The complete corpus remains in the private application.</p>}
    <nav className="detail-nav"><Link href={returnTo ?? `/${scopeQuery}`}>{returnTo ? "← Back to Intelligence" : "← Back to dashboard"}</Link></nav>
    <header className="detail-header">
      <p className="section-number">Episode audit</p><h1>{episode.title}</h1>
      <p>{episode.creator} · Published {formatDisplayDate(episode.publishedAt)} · {episode.insights.length} insight{episode.insights.length === 1 ? "" : "s"}</p>
      <p>Ingested {formatDisplayDate(episode.ingestedAt, { dateStyle: "medium", timeStyle: "short" })} · {humanize(episode.platform)}</p>
      <a className="primary-link" href={episode.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a><p className="helper-text">{episode.sourceUrl}</p>
    </header>

    <section className="episode-mentioned" aria-label="Mentioned entities and topics">{(["PLAYER", "TEAM"] as const).map((type) => <div key={type}><h2>{type === "PLAYER" ? "Mentioned players" : "Mentioned teams"}</h2><p>{entities.filter((entity) => entity.type === type).length ? entities.filter((entity) => entity.type === type).map((entity, index) => <span key={entity.id}>{index > 0 && ", "}<Link href={`/entities/${entity.id}${scopeQuery}`}>{entity.name}</Link></span>) : "None extracted"}</p></div>)}<div><h2>Topics</h2><p>{categories.length ? categories.map(humanize).join(" · ") : "No topics extracted"}</p></div></section>
    <details className="technical-details episode-technical"><summary>Technical metadata</summary><dl><dt>Episode ID</dt><dd>{episode.id}</dd><dt>External episode ID</dt><dd>{episode.externalEpisodeId}</dd><dt>Transcript</dt><dd>{humanize(episode.transcriptStatus)}</dd><dt>Extraction</dt><dd>{humanize(episode.extractionStatus)}</dd><dt>Duration</dt><dd>{episode.durationSeconds == null ? "Not recorded" : formatTimestamp(episode.durationSeconds)}</dd>{episode.extractionMetadata && <><dt>Extraction model</dt><dd>{episode.extractionMetadata.model}</dd><dt>Prompt version</dt><dd>{episode.extractionMetadata.promptVersion}</dd><dt>Extracted at</dt><dd>{formatDisplayDate(episode.extractionMetadata.extractedAt)}</dd></>}</dl></details>

    <form className="insight-filters">
      {from && <input type="hidden" name="from" value={from} />}{to && <input type="hidden" name="to" value={to} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <label>Category<Select name="category" defaultValue={category}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</Select></label>
      <label>Player/team<Select name="entity" defaultValue={entityId}><option value="">All entities</option>{entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
      <label>Recommendation<Select name="recommendation" defaultValue={recommendation}><option value="">All recommendations</option>{recommendations.map((item) => <option key={item}>{item}</option>)}</Select></label>
      <Button type="submit">Filter</Button><Link href={`/episodes/${episode.id}${detailQuery}`}>Clear</Link>
    </form>

    <section className="episode-insights" aria-label="Extracted insights">
      {visibleInsights.length === 0 ? <div className="empty-state"><p>No insights match these filters.</p></div> : visibleInsights.map((insight) => {
        const playbackSeconds = getInsightPlaybackSeconds(insight.timestampSeconds);
        const timestampUrl = playbackSeconds == null || buildYouTubeTimestampUrl(episode.sourceUrl, playbackSeconds) === null ? null : buildInsightSourceUrl(episode.sourceUrl, insight.timestampSeconds);
        return <article className="episode-insight-card" id={`insight-${insight.id}`} key={insight.id}>
          <div className="insight-badges"><span>{humanize(insight.category)}</span><span>{humanize(insight.recommendation)}</span><span>{humanize(insight.timeHorizon)}</span></div>
          <h2>{insight.claim}</h2><p><strong>Reasoning:</strong> {insight.reasoning}</p>
          {insight.entities.length > 0 && <p className="entity-links"><strong>Players/teams:</strong> {insight.entities.map((entity, index) => <span key={`${entity.id}-${entity.role}`}>{index > 0 && ", "}<Link href={`/entities/${entity.id}${scopeQuery}`}>{entity.name}</Link> <small>({humanize(entity.role)})</small></span>)}</p>}
          {insight.evidenceText && <blockquote>{insight.evidenceText}</blockquote>}
          {timestampUrl && playbackSeconds != null ? <a href={timestampUrl} target="_blank" rel="noreferrer">Play from {formatTimestamp(playbackSeconds)} · 5 seconds before evidence ↗</a> : <p className="helper-text">Timestamp unavailable · <a href={episode.sourceUrl} target="_blank" rel="noreferrer">Open original source</a></p>}
        </article>;
      })}
    </section>
  </main>;
}
