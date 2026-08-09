import { localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";

export const DEFAULT_YOUTUBE_MAX_VIDEOS_PER_CREATOR = 3;
export const MAX_YOUTUBE_VIDEOS_PER_CREATOR = 20;
export const LEGACY_UNBOUNDED_RUN_OPTIONS: ProcessingRunOptions = {
  discoveryStart: "1970-01-01T00:00:00.000Z",
  discoveryEnd: "9999-12-31T23:59:59.999Z",
  constraints: { youtube: { maxVideosPerCreator: MAX_YOUTUBE_VIDEOS_PER_CREATOR } },
};

export type ProcessingRunOptions = {
  discoveryStart: string;
  discoveryEnd: string;
  constraints: { youtube: { maxVideosPerCreator: number } };
  selectedSourceIds?: string[];
};

export type ProcessingRunRequest = {
  fromDate: string;
  toDate: string;
  timezoneOffsetMinutes: number;
  youtubeMaxVideosPerCreator: number;
  selectedSourceIds: string[];
};

export function parseProcessingRunRequest(input: unknown): ProcessingRunOptions {
  if (!input || typeof input !== "object") throw new Error("Processing scope is required.");
  const value = input as Partial<ProcessingRunRequest>;
  if (typeof value.fromDate !== "string" || typeof value.toDate !== "string") throw new Error("Choose valid from and to dates.");
  if (typeof value.timezoneOffsetMinutes !== "number") throw new Error("Timezone offset is required.");
  if (!Number.isInteger(value.youtubeMaxVideosPerCreator) || value.youtubeMaxVideosPerCreator! < 1 || value.youtubeMaxVideosPerCreator! > MAX_YOUTUBE_VIDEOS_PER_CREATOR) {
    throw new Error(`Maximum YouTube videos per creator must be between 1 and ${MAX_YOUTUBE_VIDEOS_PER_CREATOR}.`);
  }
  if (!Array.isArray(value.selectedSourceIds) || value.selectedSourceIds.length === 0) {
    throw new Error("Select at least one creator before processing.");
  }
  const selectedSourceIds = [...new Set(value.selectedSourceIds)];
  if (selectedSourceIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("The selected creator list is invalid.");
  }
  const bounds = localDateRangeToUtcBounds(value.fromDate, value.toDate, value.timezoneOffsetMinutes);
  const youtubeLimit = value.youtubeMaxVideosPerCreator as number;
  return {
    discoveryStart: bounds.startInclusive,
    discoveryEnd: bounds.endExclusive,
    constraints: { youtube: { maxVideosPerCreator: youtubeLimit } }, selectedSourceIds,
  };
}

export function isPublishedInDiscoveryWindow(publishedAt: string, options: ProcessingRunOptions) {
  const timestamp = Date.parse(publishedAt);
  return timestamp >= Date.parse(options.discoveryStart) && timestamp < Date.parse(options.discoveryEnd);
}
