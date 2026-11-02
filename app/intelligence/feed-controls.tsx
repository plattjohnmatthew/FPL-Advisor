"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SearchInput, Select } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/interactive";
import { PRIMARY_CATEGORIES } from "@/lib/insights/schema";
import { feedQuery, humanize, parseFeedFilters, type FeedFilters } from "@/lib/intelligence/filters";
import type { FeedData } from "@/lib/intelligence/feed";

export function FeedControls({ filters, sources }: { filters: FeedFilters; sources: FeedData["sources"] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const serialized = feedQuery(filters);
  useEffect(() => {
    // Preserve the cursor and any newer typing while a debounced navigation arrives.
    if (!form.current) return;
    const values = Object.fromEntries(new URLSearchParams(serialized));
    for (const input of Array.from(form.current.elements)) {
      if ((input instanceof HTMLInputElement || input instanceof HTMLSelectElement) && input !== document.activeElement) input.value = values[input.name] ?? "";
    }
  }, [serialized]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function navigate(next: FeedFilters, replace = true) {
    if (timer.current) clearTimeout(timer.current);
    const query = feedQuery(next);
    setError(null);
    startTransition(() => { router[replace ? "replace" : "push"](`/intelligence${query ? `?${query}` : ""}`, { scroll: false }); });
  }
  function apply() {
    if (!form.current) return;
    try { navigate(parseFeedFilters({ ...Object.fromEntries(new FormData(form.current)) as Record<string, string>, page: "1", tz: String(new Date().getTimezoneOffset()) })); }
    catch (error) { setError(error instanceof Error ? error.message : "Check your filters."); }
  }
  const chips = (["q", "from", "to", "creator", "category", "type"] as const).filter((key) => filters[key]).map((key) => {
    const label = key === "creator" ? sources.find((source) => source.id === filters.creator)?.name ?? "Selected creator" : key === "category" || key === "type" ? humanize(filters[key]) : `${key === "q" ? "Search" : humanize(key)}: ${filters[key]}`;
    return { key, label };
  });
  return <div className="feed-controls" aria-busy={pending}>
    <form ref={form} className="feed-filter-form" onSubmit={(event) => { event.preventDefault(); apply(); }} onChange={(event) => {
      if (timer.current) clearTimeout(timer.current);
      if (event.target instanceof HTMLInputElement && event.target.name === "q") timer.current = setTimeout(apply, 250);
      else apply();
    }}>
      <label className="feed-search">Search titles<SearchInput label="Search episode titles" name="q" defaultValue={filters.q} placeholder="Search episode titles…" maxLength={200} /></label>
      <label>Date from<Input type="date" name="from" defaultValue={filters.from} /></label>
      <label>Date to<Input type="date" name="to" defaultValue={filters.to} /></label>
      <label>Creator<Select aria-label="Creator" name="creator" defaultValue={filters.creator}><option value="">All creators</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select></label>
      <label>Topic<Select aria-label="Topic" name="category" defaultValue={filters.category}><option value="">All topics</option>{PRIMARY_CATEGORIES.map((category) => <option key={category} value={category}>{humanize(category)}</option>)}</Select></label>
      <label>Source type<Select aria-label="Source type" name="type" defaultValue={filters.type}><option value="">All types</option>{[...new Set(sources.map((source) => source.platform))].sort().map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</Select></label>
      <Button type="submit" variant="secondary">Apply filters</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div className="feed-active-filters" aria-label="Active filters">{chips.map(({ key, label }) => <Button key={key} variant="secondary" className="filter-chip" aria-label={`Remove ${label}`} onClick={() => navigate({ ...filters, [key]: "", page: 1 })}>{label}<span aria-hidden="true">×</span></Button>)}{chips.length > 0 && <Button variant="secondary" onClick={() => { form.current?.reset(); navigate(parseFeedFilters({})); }}>Clear all</Button>}<span role="status" className="helper-text">{pending ? "Updating feed…" : "Sorted by publication date, newest first"}</span></div>
  </div>;
}

export function FeedPagination({ filters, pageCount }: { filters: FeedFilters; pageCount: number }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <Pagination page={filters.page} pageCount={pageCount} loading={pending} onChange={(page) => startTransition(() => router.push(`/intelligence?${feedQuery({ ...filters, page })}`, { scroll: true }))} />;
}
