import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { IntelligenceNavigation } from "@/components/intelligence-navigation";
import { BriefingReport, BriefingWorkspace } from "../../briefing-workspace";
import { getBriefingById } from "@/lib/intelligence/briefing";

export const metadata = { title: "Saved briefing | FPL Research", description: "Read a preserved briefing with creator evidence and source links." };
export const dynamic = "force-dynamic";
export default async function HistoricalBriefing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  let briefing;
  try { briefing = await getBriefingById(id, true); }
  catch { return <main className="intelligence-shell"><PageHeader title="Saved briefing" /><EmptyState title="This briefing is temporarily unavailable" action={<Link href="/intelligence/briefings">Back to briefing history</Link>}>The stored report has not been changed. Try opening it again.</EmptyState></main>; }
  if (!briefing) notFound();
  return <main className="intelligence-shell briefing-reading">
    <PageHeader title="Saved briefing" description="A preserved version of creator research and its cited evidence." />
    <IntelligenceNavigation active="briefings" />
    <Link href="/intelligence/briefings">← Briefing history</Link>
    <p><StatusBadge tone={briefing.freshness === "stale" ? "warning" : "neutral"}>{briefing.freshness === "stale" ? "Stale · evidence has changed since generation" : briefing.freshness === "unchanged" ? "Saved inputs unchanged" : "Historical · freshness not verified"}</StatusBadge></p>
    <BriefingReport briefing={briefing} />
    {briefing.scopeType === "DATE_RANGE" && <BriefingWorkspace initialPeriod={{ from: briefing.from, to: briefing.to }} initialOffset={briefing.bounds ? (Date.parse(briefing.bounds.startInclusive) - Date.parse(`${briefing.from}T00:00:00Z`)) / 60000 : undefined} regenerate />}
  </main>;
}
