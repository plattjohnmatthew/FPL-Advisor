import assert from "node:assert/strict";
import test from "node:test";
import { difficultyBand, emptyFixtureLabel, findStrongFixtureRuns, fixtureDataStatus, highlightedFixtureIndexes, isUpcomingFixture, selectSquadFixtures, type TeamFixture } from "../../lib/fpl/fixture-runs";

const fixtures = (difficulties: number[]): TeamFixture[] => difficulties.map((difficulty, index) => ({ fixtureId: index + 1, eventId: index + 1, kickoffTime: null, opponentName: `Team ${index}`, opponentShortName: `T${index}`, venue: index % 2 ? "A" : "H", difficulty }));

test("official FDR bands use 1-2 green, 3 neutral and 4-5 red", () => { assert.equal(difficultyBand(1), "GREEN"); assert.equal(difficultyBand(2), "GREEN"); assert.equal(difficultyBand(3), "NEUTRAL"); assert.equal(difficultyBand(4), "RED"); assert.equal(difficultyBand(5), "RED"); });
test("three-match runs require exactly two greens and one neutral", () => { assert.deepEqual(findStrongFixtureRuns(fixtures([2, 3, 1])).map((run) => run.rule), ["THREE_TWO_GREEN_ONE_NEUTRAL"]); assert.equal(findStrongFixtureRuns(fixtures([1, 2, 1])).length, 0); assert.equal(findStrongFixtureRuns(fixtures([1, 2, 4])).length, 0); });
test("five-match runs detect no-red and three-green/one-red rules", () => { assert.equal(findStrongFixtureRuns(fixtures([2, 3, 2, 3, 3])).some((run) => run.rule === "FIVE_TWO_GREEN_NO_RED"), true); assert.equal(findStrongFixtureRuns(fixtures([1, 2, 4, 2, 3])).some((run) => run.rule === "FIVE_THREE_GREEN_MAX_ONE_RED"), true); assert.equal(findStrongFixtureRuns(fixtures([1, 2, 4, 4, 2])).some((run) => run.rule.startsWith("FIVE")), false); });
test("highlighting covers every fixture in a qualifying window", () => { assert.deepEqual([...highlightedFixtureIndexes(fixtures([2, 3, 1, 5]))], [0, 1, 2]); });
test("the default squad view returns only the next three fixtures", () => { assert.deepEqual(selectSquadFixtures(fixtures([2, 3, 1, 4]), "NEXT_THREE").map((fixture) => fixture.fixtureId), [1, 2, 3]); });
test("a selected gameweek keeps double fixtures and represents a blank with no rows", () => {
  const schedule = fixtures([2, 3, 4]);
  schedule[0].eventId = 10; schedule[1].eventId = 10; schedule[2].eventId = 12;
  assert.deepEqual(selectSquadFixtures(schedule, 10).map((fixture) => fixture.fixtureId), [1, 2]);
  assert.deepEqual(selectSquadFixtures(schedule, 11), []);
});
test("past kickoffs cannot remain upcoming because of stale started flags", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(isUpcomingFixture({ finished: false, kickoffTime: "2026-10-31T20:00:00Z" }, now), false);
  assert.equal(isUpcomingFixture({ finished: false, kickoffTime: "2026-11-08T16:30:00Z" }, now), true);
  assert.equal(isUpcomingFixture({ finished: true, kickoffTime: "2026-11-08T16:30:00Z" }, now), false);
});
test("fixture freshness distinguishes current, stale and unavailable data", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(fixtureDataStatus("2026-11-02T08:00:00Z", now), "CURRENT");
  assert.equal(fixtureDataStatus("2026-10-31T08:00:00Z", now), "STALE");
  assert.equal(fixtureDataStatus(null, now), "UNAVAILABLE");
});
test("only fresh confirmed absence is labelled as a blank gameweek", () => {
  assert.equal(emptyFixtureLabel("CURRENT", 11), "Blank GW11");
  assert.equal(emptyFixtureLabel("STALE", 11), "Refresh needed");
  assert.equal(emptyFixtureLabel("UNAVAILABLE", 11), "Fixture unavailable");
  assert.equal(emptyFixtureLabel("CURRENT", null), "No upcoming fixture");
});
