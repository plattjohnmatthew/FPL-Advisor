import Link from "next/link";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { IntelligenceNavigation } from "@/components/intelligence-navigation";
import { BriefingWorkspace } from "../briefing-workspace";
import { briefingPage, getBriefingHistory } from "@/lib/intelligence/briefing-history";
import { formatDisplayDate } from "@/lib/dates/display";

export const metadata = { title: "Briefing history | FPL Research", description: "Explore preserved FPL research briefings and their source evidence." };
export const dynamic = "force-dynamic";
export default async function BriefingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = briefingPage((await searchParams).page);
  let history;
  try { history = await getBriefingHistory(page); }
  catch { return <main className="intelligence-shell"><PageHeader title="Briefing history" /><IntelligenceNavigation active="briefings" /><EmptyState title="Briefing history is temporarily unavailable" action={<Link href="/intelligence/briefings">Try again</Link>}>Your stored reports are retained.</EmptyState></main>; }
  return <main className="intelligence-shell">
    <PageHeader title="Briefing history" description="Reopen saved analysis without generating it again. Each version is retained." />
    <IntelligenceNavigation active="briefings" />
    <BriefingWorkspace />
    <section aria-labelledby="saved-briefings-heading"><div className="section-heading"><h2 id="saved-briefings-heading">Saved briefings</h2><span className="helper-text">{history.total} saved · newest first</span></div>
      {!history.items.length ? <EmptyState title={history.total ? "No briefings on this page" : "No briefings yet."} action={<Link href={history.total ? "/intelligence/briefings" : "#briefing-heading"}>{history.total ? "Return to latest briefings" : "Generate your first briefing"}</Link>}>Use Generate briefing to create analysis from saved insights.</EmptyState>
      : <ol className="briefing-history-list">{history.items.map((item) => <li key={item.id}>
        <div><StatusBadge tone="success">Completed</StatusBadge><h3><Link prefetch={false} href={`/intelligence/briefings/${item.id}`}>{item.scope_type === "DATE_RANGE" ? `${item.from_date} to ${item.to_date}` : "Processing-run briefing"}</Link></h3>
        <p className="helper-text">Generated {formatDisplayDate(item.generated_at, { dateStyle: "medium", timeStyle: "short" })}</p>
        <p>{item.included_episode_count} episodes · {item.distinct_creator_count} creators · Historical version</p></div>
        <Link prefetch={false} href={`/intelligence/briefings/${item.id}`}>View briefing →</Link>
      </li>)}</ol>}
      {history.pageCount > 1 && <nav className="briefing-history-pagination" aria-label="Briefing history pages">{page > 1 && <Link href={`/intelligence/briefings?page=${page - 1}`}>Previous</Link>}<span>Page {page} of {history.pageCount}</span>{page < history.pageCount && <Link href={`/intelligence/briefings?page=${page + 1}`}>Next</Link>}</nav>}
    </section>
  </main>;
}
