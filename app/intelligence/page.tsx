import { getAppCapabilities } from "@/lib/app-config";
import Link from "next/link";
import { IntelligenceNavigation } from "@/components/intelligence-navigation";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { getResearchFeed } from "@/lib/intelligence/feed";
import { feedQuery, humanize, parseFeedFilters, type FeedSearch } from "@/lib/intelligence/filters";
import { formatDisplayDate } from "@/lib/dates/display";
import { processingStatus } from "@/lib/processing/presentation";
import { FeedControls, FeedPagination } from "./feed-controls";
import { BriefingWorkspace } from "./briefing-workspace";

export const metadata = { title: "Intelligence | FPL Research", description: "Browse creator claims, cited evidence and saved research briefings." };
export const dynamic = "force-dynamic";
export default async function IntelligencePage({ searchParams }: { searchParams: Promise<FeedSearch> }) {
  let filters; let data;
  try { filters = parseFeedFilters(await searchParams); data = await getResearchFeed(filters); }
  catch (error) { return <main className="intelligence-shell"><PageHeader title="Intelligence" description="Browse creator research and the evidence behind it." /><EmptyState title="Research feed unavailable" action={<Link href="/intelligence">Reset filters and try again</Link>}>{error instanceof Error ? error.message : "Unable to load research."}</EmptyState></main>; }
  const back = `/intelligence${feedQuery(filters) ? `?${feedQuery(filters)}` : ""}`;
  return <main className="intelligence-shell">
    <PageHeader title="Intelligence" description="Browse creator research and the evidence behind it." />
    <IntelligenceNavigation active="research" />
    <BriefingWorkspace />
    <FeedControls filters={filters} sources={data.sources} />
    <section aria-labelledby="research-feed-heading" className="research-feed">
      <div className="section-heading"><h2 id="research-feed-heading">Research feed</h2><p className="helper-text">{data.total} episode{data.total === 1 ? "" : "s"}{data.items.length ? ` · Page ${filters.page} of ${data.pageCount}` : ""}</p></div>
      {data.items.length === 0 ? <EmptyState title={data.total ? "No episodes on this page" : "No episodes match these filters"} action={<Link href="/intelligence">Clear filters</Link>}>Try a different publication period, creator or topic.{getAppCapabilities().canProcessSources && " Processing is managed in Sources."}</EmptyState> : <ul className="research-feed-list">{data.items.map((item) => {
        const href = `/episodes/${item.id}?returnTo=${encodeURIComponent(back)}`;
        const status = item.status ? processingStatus(item.status) : null;
        return <li className="research-feed-item" key={item.id} data-published-at={item.publishedAt}>
          <div className="feed-item-content"><div className="feed-item-meta"><span>{item.creator}</span><span>{humanize(item.platform)}</span><time dateTime={item.publishedAt}>{formatDisplayDate(item.publishedAt)}</time>{status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}</div>
            <h3><Link href={href}>{item.title}</Link></h3>
            {item.claimExcerpt && <p className="feed-excerpt"><span>Extracted claim:</span> {item.claimExcerpt}</p>}
            <div className="feed-topics">{item.categories.map((category) => <StatusBadge key={category}>{humanize(category)}</StatusBadge>)}</div>
          </div><Link className="feed-inspect" href={href} aria-label={`Inspect ${item.title}`}>Inspect <span aria-hidden="true">↗</span></Link>
        </li>;
      })}</ul>}
      {data.pageCount > 0 && <FeedPagination filters={filters} pageCount={data.pageCount} />}
    </section>
  </main>;
}
