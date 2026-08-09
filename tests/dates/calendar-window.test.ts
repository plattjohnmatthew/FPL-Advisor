import assert from "node:assert/strict";
import test from "node:test";
import { latestSevenLocalDates, localDateRangeToUtcBounds } from "../../lib/dates/calendar-window";

test("same local calendar day uses timezone-aware UTC boundaries", () => {
  assert.deepEqual(localDateRangeToUtcBounds("2026-08-08", "2026-08-08", -120), {
    startInclusive: "2026-08-07T22:00:00.000Z",
    endExclusive: "2026-08-08T22:00:00.000Z",
  });
});

test("positive UTC offsets preserve the selected local day across midnight", () => {
  assert.deepEqual(localDateRangeToUtcBounds("2026-01-10", "2026-01-10", 300), {
    startInclusive: "2026-01-10T05:00:00.000Z",
    endExclusive: "2026-01-11T05:00:00.000Z",
  });
});

test("default window is seven inclusive local calendar dates", () => {
  const window = latestSevenLocalDates(new Date("2026-08-08T00:30:00.000Z"), -120);
  assert.equal(window.fromDate, "2026-08-02");
  assert.equal(window.toDate, "2026-08-08");
  assert.equal(window.startInclusive, "2026-08-01T22:00:00.000Z");
  assert.equal(window.endExclusive, "2026-08-08T22:00:00.000Z");
});
