import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { EntitySearch } from "@/components/entity-search";
import { resolveEntityRange } from "@/lib/entities/scope";
import { searchEntities } from "@/lib/entities/repository";

export const dynamic = "force-dynamic";
function value(search: Record<string, string | string[] | undefined>, key: string) { const item = search[key]; return Array.isArray(item) ? item[0] ?? "" : item ?? ""; }

export default async function EntitySearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams; const term = value(search, "q");
  const range = resolveEntityRange({ range: value(search, "range"), from: value(search, "from"), to: value(search, "to") });
  let results: Awaited<ReturnType<typeof searchEntities>> = [];
  let error = false;
  try { results = await searchEntities(term); } catch { error = true; }
  return <main className="detail-shell players-shell">
    <PageHeader title="Players & teams" description="Find a player or club and explore the stored creator research." actions={<Link prefetch={false} className="button-link secondary-button" href="/fixtures">Fixtures</Link>} />
    {error && <p role="alert">Player and team search is temporarily unavailable. Try again below.</p>}
    <EntitySearch key={term + range.query} initialTerm={term} initialResults={results} rangeQuery={range.query} />
  </main>;
}
