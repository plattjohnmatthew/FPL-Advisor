export function formatTimestamp(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function buildYouTubeTimestampUrl(sourceUrl: string, timestampSeconds: number) {
  try {
    const url = new URL(sourceUrl);
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname.toLowerCase())) return null;
    url.searchParams.set("t", `${Math.max(0, Math.floor(timestampSeconds))}s`);
    return url.toString();
  } catch {
    return null;
  }
}

export const INSIGHT_LINK_LEAD_SECONDS = 5;

export function getInsightPlaybackSeconds(timestampSeconds: number | null, leadSeconds = INSIGHT_LINK_LEAD_SECONDS) {
  if (timestampSeconds == null || !Number.isFinite(timestampSeconds)) return null;
  return Math.max(0, Math.floor(timestampSeconds) - Math.max(0, Math.floor(leadSeconds)));
}

export function buildInsightSourceUrl(sourceUrl: string, timestampSeconds: number | null, leadSeconds = INSIGHT_LINK_LEAD_SECONDS) {
  const playbackSeconds = getInsightPlaybackSeconds(timestampSeconds, leadSeconds);
  if (playbackSeconds == null) return sourceUrl;
  return buildYouTubeTimestampUrl(sourceUrl, playbackSeconds) ?? sourceUrl;
}

export function dateScopeQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (/^\d{4}-\d{2}-\d{2}$/.test(from ?? "")) params.set("from", from!);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to ?? "")) params.set("to", to!);
  const query = params.toString();
  return query ? `?${query}` : "";
}
