import Link from "next/link";
import { resolveEntityRange } from "@/lib/entities/scope";
import { searchEntities } from "@/lib/entities/repository";

export const dynamic = "force-dynamic";
function value(search: Record<string, string | string[] | undefined>, key: string) { const item = search[key]; return Array.isArray(item) ? item[0] ?? "" : item ?? ""; }

export default async function EntitySearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams; const term = value(search, "q");
  const range = resolveEntityRange({ range: value(search, "range"), from: value(search, "from"), to: value(search, "to") });
  const results = await searchEntities(term);
  return <main className="detail-shell"><nav className="detail-nav"><Link href="/">← Back to dashboard</Link></nav>
    <header className="detail-header"><p className="section-number">Stored research</p><h1>Explore players and teams</h1><p>Search canonical entities and aliases without processing transcripts or calling OpenAI.</p></header>
    <form className="entity-search"><input type="hidden" name="range" value={range.preset} />{range.preset === "custom" && <><input type="hidden" name="from" value={range.fromDate} /><input type="hidden" name="to" value={range.toDate} /></>}<label htmlFor="entity-query">Player or team</label><div><input id="entity-query" name="q" defaultValue={term} minLength={2} placeholder="Saka, Arsenal, Watkins…" autoFocus /><button type="submit">Search</button></div></form>
    {term.length >= 2 && <section className="entity-results"><p className="helper-text">{results.length} result{results.length === 1 ? "" : "s"}</p>{results.length ? <ul>{results.map((entity) => <li key={entity.id}><Link href={`/entities/${entity.id}${range.query}`}><strong>{entity.name}</strong><span>{entity.type === "PLAYER" ? "Player" : "Team"}</span></Link></li>)}</ul> : <div className="empty-state"><p>No canonical player or team matched “{term}”.</p></div>}</section>}
  </main>;
}
