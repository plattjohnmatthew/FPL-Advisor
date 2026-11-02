"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, SearchInput } from "@/components/ui/primitives";
import type { EntitySearchResult } from "@/lib/entities/repository";

export function EntitySearch({ initialTerm, initialResults, rangeQuery }: { initialTerm: string; initialResults: EntitySearchResult[]; rangeQuery: string }) {
  const router = useRouter();
  const [term, setTerm] = useState(initialTerm); const [results, setResults] = useState(initialResults);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const grouped = [results.filter((item) => item.type === "PLAYER"), results.filter((item) => item.type === "TEAM")];
  const ordered = grouped.flat();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (term.trim().length < 2 && !/^\d+$/.test(term.trim())) { setResults([]); setLoading(false); return; }
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/entities/search?${new URLSearchParams({ q: term })}`, { signal: controller.signal });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        setResults(body.results); setActive(-1);
      } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Search unavailable."); setResults([]); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);
  const href = (id: string) => `/entities/${encodeURIComponent(id)}${rangeQuery}`;
  return <div className="entity-autocomplete" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <form action="/players" className="entity-search" onSubmit={(event) => { if (open && active >= 0 && ordered[active]) { event.preventDefault(); router.push(href(ordered[active].id)); } }}>
      {[...new URLSearchParams(rangeQuery.slice(1))].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <label htmlFor="entity-query">Search players and teams</label><div><SearchInput label="Search players and teams" id="entity-query" name="q" placeholder="Player, club, alias or FPL ID…" value={term} onChange={(event) => { setTerm(event.target.value); setResults([]); setError(""); setLoading(true); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} role="combobox" aria-expanded={open} aria-controls="entity-suggestions" aria-autocomplete="list" aria-activedescendant={open && active >= 0 ? `entity-option-${active}` : undefined} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        if (["ArrowDown", "ArrowUp"].includes(event.key) && ordered.length) { event.preventDefault(); setOpen(true); setActive((index) => event.key === "ArrowDown" ? (index + 1) % ordered.length : (index - 1 + ordered.length) % ordered.length); }
      }} /><Button type="submit">Search</Button></div>
    </form>
    <p role="status" className="helper-text">{loading ? "Searching stored players and teams…" : error || (term ? `${results.length} matches · Use arrows and Enter, or choose a result.` : "Search canonical names, aliases and clubs.")}</p>
    <div id="entity-suggestions" role="listbox" aria-label="Players and teams" hidden={!open}>
      {grouped.map((items, group) => items.length > 0 && <div role="group" aria-labelledby={`entity-group-${group}`} key={group}><h2 id={`entity-group-${group}`}>{group === 0 ? "Players" : "Teams"}</h2>{items.map((item) => { const index = ordered.indexOf(item); return <div key={item.id} role="option" aria-selected={active === index} id={`entity-option-${index}`}><Link prefetch={false} href={href(item.id)}><strong>{item.name}</strong><span>{[item.club, item.position, item.externalFplId != null ? `FPL ID ${item.externalFplId}` : null].filter(Boolean).join(" · ")}</span></Link></div>; })}</div>)}
      {!loading && !error && term && results.length === 0 && <p>No stored player or team matched. Try a surname or club.</p>}
    </div>
    {!open && results.length > 0 && <div className="entity-search-results">{grouped.map((items, group) => items.length > 0 && <section key={group}><h2>{group === 0 ? "Players" : "Teams"}</h2>{items.map((item) => <Link prefetch={false} href={href(item.id)} key={item.id}>{item.name}<span>{item.club}</span></Link>)}</section>)}</div>}
  </div>;
}
