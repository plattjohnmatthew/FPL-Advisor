import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDisplayDate } from "@/lib/dates/display";
import { buildYouTubeTimestampUrl, dateScopeQuery, formatTimestamp } from "@/lib/episodes/presentation";
import { getEpisodeDetail } from "@/lib/episodes/repository";

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

  return <main className="detail-shell">
    <nav className="detail-nav"><Link href={`/${scopeQuery}`}>← Back to dashboard</Link></nav>
    <header className="detail-header">
      <p className="section-number">Episode audit</p><h1>{episode.title}</h1>
      <p>{episode.creator} · Published {formatDisplayDate(episode.publishedAt)} · {episode.insights.length} insight{episode.insights.length === 1 ? "" : "s"}</p>
      <p>Transcript: {humanize(episode.transcriptStatus)} · Extraction: {humanize(episode.extractionStatus)}</p>
      <a className="primary-link" href={episode.sourceUrl} target="_blank" rel="noreferrer">Open original video ↗</a>
    </header>

    <form className="insight-filters">
      {from && <input type="hidden" name="from" value={from} />}{to && <input type="hidden" name="to" value={to} />}
      <label>Category<select name="category" defaultValue={category}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Player/team<select name="entity" defaultValue={entityId}><option value="">All entities</option>{entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Recommendation<select name="recommendation" defaultValue={recommendation}><option value="">All recommendations</option>{recommendations.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="submit">Filter</button><Link href={`/episodes/${episode.id}${scopeQuery}`}>Clear</Link>
    </form>

    <section className="episode-insights" aria-label="Extracted insights">
      {visibleInsights.length === 0 ? <div className="empty-state"><p>No insights match these filters.</p></div> : visibleInsights.map((insight) => {
        const timestampUrl = insight.timestampSeconds == null ? null : buildYouTubeTimestampUrl(episode.sourceUrl, insight.timestampSeconds);
        return <article className="episode-insight-card" key={insight.id}>
          <div className="insight-badges"><span>{humanize(insight.category)}</span><span>{humanize(insight.recommendation)}</span><span>{humanize(insight.timeHorizon)}</span></div>
          <h2>{insight.claim}</h2><p><strong>Reasoning:</strong> {insight.reasoning}</p>
          {insight.entities.length > 0 && <p className="entity-links"><strong>Players/teams:</strong> {insight.entities.map((entity, index) => <span key={`${entity.id}-${entity.role}`}>{index > 0 && ", "}<Link href={`/entities/${entity.id}${scopeQuery}`}>{entity.name}</Link> <small>({humanize(entity.role)})</small></span>)}</p>}
          {insight.evidenceText && <blockquote>{insight.evidenceText}</blockquote>}
          {timestampUrl && insight.timestampSeconds != null ? <a href={timestampUrl} target="_blank" rel="noreferrer">Watch at {formatTimestamp(insight.timestampSeconds)} ↗</a> : <p className="helper-text">Timestamp unavailable</p>}
        </article>;
      })}
    </section>
  </main>;
}
