export const MAX_SPECIFIC_VIDEO_URLS = 20;

export type SubmittedUrlStatus = "VALID" | "DUPLICATE_IN_BATCH" | "INVALID_URL" | "UNSUPPORTED_URL";
export type NormalizedUrlItem = {
  lineNumber: number;
  submittedUrl: string;
  normalizedUrl: string | null;
  videoId: string | null;
  status: SubmittedUrlStatus;
  errorMessage: string | null;
};

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function normalizeYouTubeVideoUrl(input: string): { videoId: string; normalizedUrl: string } | { error: "INVALID_URL" | "UNSUPPORTED_URL"; message: string } {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return { error: "INVALID_URL", message: "Enter a complete YouTube URL." }; }
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return { error: "INVALID_URL", message: "Only HTTPS YouTube URLs are accepted." };
  }
  const hostname = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (hostname.endsWith("youtu.be")) videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  else if (url.pathname === "/watch") videoId = url.searchParams.get("v");
  else videoId = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)$/)?.[1] ?? null;
  if (!videoId) return { error: "UNSUPPORTED_URL", message: "This is a YouTube URL, but not a supported video URL." };
  if (!VIDEO_ID.test(videoId)) return { error: "INVALID_URL", message: "The YouTube video ID is invalid." };
  return { videoId, normalizedUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

export function parseSpecificVideoUrls(input: string): NormalizedUrlItem[] {
  const lines = input.split(/\r?\n/).map((value, index) => ({ value: value.trim(), lineNumber: index + 1 })).filter((line) => line.value.length > 0);
  if (lines.length > MAX_SPECIFIC_VIDEO_URLS) throw new Error(`Paste no more than ${MAX_SPECIFIC_VIDEO_URLS} YouTube URLs at once.`);
  const seen = new Set<string>();
  return lines.map((line) => {
    const normalized = normalizeYouTubeVideoUrl(line.value);
    if ("error" in normalized) return { lineNumber: line.lineNumber, submittedUrl: line.value, normalizedUrl: null, videoId: null, status: normalized.error, errorMessage: normalized.message };
    if (seen.has(normalized.videoId)) return { lineNumber: line.lineNumber, submittedUrl: line.value, ...normalized, status: "DUPLICATE_IN_BATCH", errorMessage: "Duplicate video in this batch." };
    seen.add(normalized.videoId);
    return { lineNumber: line.lineNumber, submittedUrl: line.value, ...normalized, status: "VALID", errorMessage: null };
  });
}
