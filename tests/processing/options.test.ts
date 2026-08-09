import assert from "node:assert/strict";
import test from "node:test";
import { parseProcessingRunRequest } from "../../lib/processing/options";

test("processing request converts selected local calendar dates to UTC scope", () => {
  assert.deepEqual(parseProcessingRunRequest({
    fromDate: "2026-08-01", toDate: "2026-08-08", timezoneOffsetMinutes: -120, youtubeMaxVideosPerCreator: 3,
    selectedSourceIds: ["00000000-0000-4000-8000-000000000001"],
  }), {
    discoveryStart: "2026-07-31T22:00:00.000Z", discoveryEnd: "2026-08-08T22:00:00.000Z",
    constraints: { youtube: { maxVideosPerCreator: 3 } }, selectedSourceIds: ["00000000-0000-4000-8000-000000000001"],
  });
});

test("processing request rejects reversed dates and unsafe video limits", () => {
  assert.throws(() => parseProcessingRunRequest({ fromDate: "2026-08-08", toDate: "2026-08-01", timezoneOffsetMinutes: 0, youtubeMaxVideosPerCreator: 3, selectedSourceIds: ["00000000-0000-4000-8000-000000000001"] }), /from date/i);
  for (const limit of [0, -1, 21, 1.5]) {
    assert.throws(() => parseProcessingRunRequest({ fromDate: "2026-08-01", toDate: "2026-08-08", timezoneOffsetMinutes: 0, youtubeMaxVideosPerCreator: limit, selectedSourceIds: ["00000000-0000-4000-8000-000000000001"] }), /between 1 and 20/i);
  }
});

test("processing request requires at least one selected creator", () => {
  assert.throws(() => parseProcessingRunRequest({ fromDate: "2026-08-01", toDate: "2026-08-08", timezoneOffsetMinutes: 0, youtubeMaxVideosPerCreator: 3, selectedSourceIds: [] }), /at least one creator/i);
});
