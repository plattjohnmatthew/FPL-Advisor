import { difficultyBand, highlightedFixtureIndexes } from "@/lib/fpl/fixture-runs";
import { loadFixtureDifficulty } from "@/lib/fpl/fixtures-repository";
import { formatDisplayDate } from "@/lib/dates/display";

export const dynamic = "force-dynamic";
const RULE_LABELS = { THREE_TWO_GREEN_ONE_NEUTRAL: "3 matches: 2 green + 1 neutral", FIVE_TWO_GREEN_NO_RED: "5 matches: 2+ green, no red", FIVE_THREE_GREEN_MAX_ONE_RED: "5 matches: 3+ green, max 1 red" } as const;

export default async function FixturesPage() {
  const { schedules, updatedAt } = await loadFixtureDifficulty();
  return <main className="detail-shell fixtures-shell" id="main-content"><header className="detail-header settings-header"><p className="section-number">Official FPL data</p><h1>Fixture difficulty</h1><p>Upcoming official fixture difficulty ratings. Green is 1–2, neutral is 3, and red is 4–5. Outlined fixtures belong to at least one strong run.</p>{updatedAt && <p className="helper-text">Last refreshed {formatDisplayDate(updatedAt, { dateStyle: "medium", timeStyle: "short" })}</p>}</header>
    <section className="fixture-legend" aria-label="Fixture difficulty legend"><span className="fdr-1">1–2 favourable</span><span className="fdr-3">3 neutral</span><span className="fdr-5">4–5 difficult</span><span className="fixture-highlight-key">Strong run</span></section>
    <section className="fixture-table" aria-label="Upcoming fixture difficulty by team">{schedules.map((schedule) => { const highlighted = highlightedFixtureIndexes(schedule.fixtures); return <article className="fixture-team-row" key={schedule.teamId}><div className="fixture-team"><strong>{schedule.teamName}</strong><span>{schedule.shortName}</span></div><div className="fixture-cells">{schedule.fixtures.map((fixture, index) => <div className={`fixture-cell fdr-${difficultyBand(fixture.difficulty).toLowerCase()} ${highlighted.has(index) ? "strong-fixture" : ""}`} key={fixture.fixtureId} title={`${fixture.opponentName} · difficulty ${fixture.difficulty}`}><span>GW{fixture.eventId ?? "–"}</span><strong>{fixture.opponentShortName} ({fixture.venue})</strong><small>FDR {fixture.difficulty}</small></div>)}</div>{schedule.strongRuns.length > 0 && <div className="fixture-run-labels">{[...new Set(schedule.strongRuns.map((run) => run.rule))].map((rule) => <span key={rule}>{RULE_LABELS[rule]}</span>)}</div>}</article>; })}</section>
    {schedules.length === 0 && <div className="empty-state"><p>No synchronized fixtures are available.</p><p>Use Refresh FPL data in Settings, then return here.</p></div>}
  </main>;
}
