"use client";

import Link from "next/link";
import { useState } from "react";
import { deriveFormation, orderedBench, playerExplorerHref, type SquadPlayer } from "@/lib/fpl-entry/presentation";
import { getTeamPresentation } from "@/lib/fpl-entry/team-colors";
import { difficultyBand, emptyFixtureLabel, selectSquadFixtures, type SquadFixtureCalendar, type SquadFixtureMode, type TeamFixture } from "@/lib/fpl/fixture-runs";

export function SquadPitch({ picks, fixtureCalendar }: { picks: SquadPlayer[]; fixtureCalendar: SquadFixtureCalendar }) {
  const [fixtureMode, setFixtureMode] = useState<SquadFixtureMode>("NEXT_THREE");
  const formation = deriveFormation(picks);
  const fixturesFor = (pick: SquadPlayer) => selectSquadFixtures(fixtureCalendar.fixturesByTeam[pick.fplTeamId] ?? [], fixtureMode);
  const selectedGameweek = fixtureMode === "NEXT_THREE" ? null : fixtureMode;
  const fixtureStatus = fixtureCalendar.status === "CURRENT"
    ? `Official FPL fixtures refreshed ${formatFixtureFreshness(fixtureCalendar.updatedAt)}.`
    : fixtureCalendar.status === "STALE"
      ? "Fixture data is older than 24 hours. Refresh before treating blanks as confirmed."
      : "Fixture data is unavailable. Refresh to load the official schedule.";

  return <>
    <section className="squad-pitch-section" aria-labelledby="starting-xi-heading">
      <div className="pitch-heading squad-fixture-heading">
        <div>
          <p className="eyebrow">Starting XI</p>
          <h2 id="starting-xi-heading">Formation {formation.label}</h2>
          <p>{fixtureMode === "NEXT_THREE" ? "Next three scheduled fixtures from the official FPL calendar." : `Official Gameweek ${fixtureMode} fixture view.`}</p>
          <p className={`fixture-freshness fixture-freshness-${fixtureCalendar.status.toLowerCase()}`}>{fixtureStatus}</p>
        </div>
        <label className="gameweek-picker">Fixture view
          <select aria-label="Fixture view" value={String(fixtureMode)} onChange={(event) => setFixtureMode(event.target.value === "NEXT_THREE" ? "NEXT_THREE" : Number(event.target.value))}>
            <option value="NEXT_THREE">Next 3 fixtures</option>
            {fixtureCalendar.gameweeks.map((gameweek) => <option value={gameweek} key={gameweek}>Gameweek {gameweek}</option>)}
          </select>
        </label>
      </div>
      <div className="football-pitch" data-testid="football-pitch">
        {formation.rows.map((row) => <div className={`pitch-row pitch-${row.position.toLowerCase()}`} key={row.position} aria-label={row.position}>
          {row.players.map((pick) => <PlayerNode key={pick.fplPlayerId} pick={pick} fixtures={fixturesFor(pick)} selectedGameweek={selectedGameweek} fixtureCalendar={fixtureCalendar} />)}
        </div>)}
      </div>
    </section>
    <section className="panel bench-panel" aria-labelledby="bench-heading">
      <div className="pitch-heading"><div><p className="eyebrow">Substitutes</p><h2 id="bench-heading">Bench order</h2></div></div>
      <div className="bench-row">{orderedBench(picks).map((pick) => <PlayerNode key={pick.fplPlayerId} pick={pick} fixtures={fixturesFor(pick)} selectedGameweek={selectedGameweek} fixtureCalendar={fixtureCalendar} bench />)}</div>
    </section>
  </>;
}

function PlayerNode({ pick, fixtures, selectedGameweek, fixtureCalendar, bench = false }: { pick: SquadPlayer; fixtures: TeamFixture[]; selectedGameweek: number | null; fixtureCalendar: SquadFixtureCalendar; bench?: boolean }) {
  const kit = getTeamPresentation(pick.fplTeamId);
  const href = playerExplorerHref(pick.entityId) ?? `/players?${new URLSearchParams({ q: String(pick.fplPlayerId), range: "14d" })}`;
  const fallbackLabel = emptyFixtureLabel(fixtureCalendar.status, selectedGameweek);
  const fixtureLabel = fixtures.length > 0 ? fixtures.map((fixture) => `${fixture.opponentShortName} ${fixture.venue}`).join(", ") : fallbackLabel;
  const role = pick.isCaptain ? "C" : pick.isViceCaptain ? "VC" : null;
  const content = <>
    <span className="jersey" data-pattern={kit.pattern.toLowerCase()} title={`${pick.teamName} stylized shirt`} aria-hidden="true" style={{ "--shirt-primary": kit.primary, "--shirt-secondary": kit.secondary, "--shirt-accent": kit.accent, "--shirt-text": kit.text } as React.CSSProperties}>
      <span className="jersey-collar" /><span className="jersey-position">{pick.position}</span>
    </span>
    <span className="player-label">
      <span className="player-name-row"><strong>{pick.webName}</strong>{role && <b className={`captain-marker captain-marker-${role.toLowerCase()}`}>{role}</b>}</span>
      <span className="player-meta">£{pick.currentPrice.toFixed(1)}m<span aria-hidden="true"> · </span>{pick.recentInsightCount} insight{pick.recentInsightCount === 1 ? "" : "s"}</span>
      {selectedGameweek != null && fixtures.length > 1 && <span className="double-gameweek-label">DGW · {fixtures.length} fixtures</span>}
      <span className="player-fixtures" aria-label={`Fixtures: ${fixtureLabel}`}>
        {fixtures.length > 0 ? fixtures.map((fixture) => <small className={`player-fixture fdr-${difficultyBand(fixture.difficulty).toLowerCase()}`} key={fixture.fixtureId} title={`${fixture.opponentName} ${fixture.venue === "H" ? "at home" : "away"}`}>
          {selectedGameweek == null && <b>GW{fixture.eventId} </b>}{fixture.opponentShortName} ({fixture.venue})
        </small>) : <small className={`player-fixture fixture-fallback fixture-fallback-${fixtureCalendar.status.toLowerCase()}`}>{fallbackLabel}</small>}
      </span>
    </span>
    {bench && <small className="bench-number" aria-label={`Bench position ${pick.benchOrder}`}>{pick.benchOrder}</small>}
  </>;
  return <Link prefetch={false} data-testid="squad-player-card" className="pitch-player" href={href} aria-label={`${pick.webName}, ${pick.position}, £${pick.currentPrice.toFixed(1)}m.${pick.isCaptain ? " Captain." : pick.isViceCaptain ? " Vice captain." : ""} ${fixtureLabel}. Open recent insights.`}>{content}{!pick.entityId && <span className="mapping-note">Find player research</span>}</Link>;
}

function formatFixtureFreshness(value: string | null) {
  if (!value) return "at an unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "at an unknown time" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
