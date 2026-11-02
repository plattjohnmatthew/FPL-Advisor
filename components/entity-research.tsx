import { recommendationStance } from "@/lib/opinions/aggregation";
import type { EntityExplorerInsight } from "@/lib/entities/repository";
import { formatDisplayDate } from "@/lib/dates/display";

export function EntityArguments({ insights }: { insights: EntityExplorerInsight[] }) {
  return <div className="entity-arguments">{(["POSITIVE", "NEGATIVE"] as const).map((stance) => {
    const items = insights.filter((item) => recommendationStance(item.recommendation) === stance);
    return <section key={stance}><h2>{stance === "POSITIVE" ? "Positive arguments" : "Negative arguments"}</h2>{items.length ? <ul>{items.slice(0, 4).map((item) => <li key={item.id}><a href={`#research-${item.id}`}>{item.claim}</a><span>{item.sourceName} · {formatDisplayDate(item.publishedAt)}</span></li>)}</ul> : <p className="helper-text">No {stance.toLowerCase()} creator recommendations in the filtered evidence.</p>}</section>;
  })}</div>;
}

export function EntityChronology({ insights }: { insights: EntityExplorerInsight[] }) {
  if (!insights.length) return null;
  return <details className="entity-chronology"><summary>Chronology · {insights.length} stored claims</summary><ol>{[...insights].sort((a,b) => a.publishedAt.localeCompare(b.publishedAt)).map((item) => <li key={item.id}><time dateTime={item.publishedAt}>{formatDisplayDate(item.publishedAt)}</time><a href={`#research-${item.id}`}>{item.sourceName}: {item.claim}</a></li>)}</ol></details>;
}

export function EntityMetadata({ metadata, type }: { metadata: Record<string, unknown>; type: "PLAYER" | "TEAM" }) {
  const team = Array.isArray(metadata.fpl_teams) ? metadata.fpl_teams[0] : metadata.fpl_teams;
  const club = team && typeof team === "object" && "name" in team ? String(team.name) : null;
  const price = metadata.current_price == null ? null : Number(metadata.current_price);
  const values = type === "TEAM" ? [["Club", metadata.name], ["Short name", metadata.short_name], ["FPL ID", metadata.fpl_team_id]] : [["Club", club], ["Position", metadata.position], ["Latest stored FPL price", price != null && Number.isFinite(price) ? `£${price.toFixed(1)}m` : null], ["Status code", metadata.status], ["FPL ID", metadata.fpl_player_id]];
  return <section className="entity-metadata" aria-label="Official FPL metadata"><p className="eyebrow">Official FPL metadata · latest saved observation</p><dl>{values.filter(([, value]) => value != null && value !== "").map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl>{typeof metadata.updated_at === "string" && <p className="helper-text">Observed {formatDisplayDate(metadata.updated_at, { dateStyle: "medium", timeStyle: "short" })}</p>}</section>;
}
