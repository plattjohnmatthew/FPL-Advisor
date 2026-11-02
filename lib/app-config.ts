export type AppMode = "private" | "public_read_only";
export function getAppCapabilities() {
  const mode = process.env.APP_MODE ?? "private";
  if (mode !== "private" && mode !== "public_read_only") throw new Error("APP_MODE must be private or public_read_only");
  if (process.env.VERCEL === "1" && mode !== "public_read_only") throw new Error("Vercel deployments require APP_MODE=public_read_only");
  const enabled = mode === "private";
  return { mode: mode as AppMode, canProcessSources: enabled, canGenerateBriefings: enabled,
    canAskAI: enabled, canRefreshFpl: enabled, canWriteData: enabled,
    canEditSettings: enabled, canRetryJobs: enabled, canViewSquad: enabled || process.env.PUBLIC_SHOW_SQUAD === "true" };
}
export type AppCapabilities = ReturnType<typeof getAppCapabilities>;
export type Capability = Exclude<keyof AppCapabilities, "mode">;
export function disabledResponse(capability: Capability): Response | null {
  return getAppCapabilities()[capability] ? null : Response.json({ code: "PUBLIC_READ_ONLY", error: "This action is unavailable in the public research edition." }, { status: 403 });
}
export function requireCapability(capability: Capability) {
  if (!getAppCapabilities()[capability]) throw new Error("PUBLIC_READ_ONLY: operation disabled");
}
const publicPages = /^\/(?:intelligence(?:\/briefings(?:\/[0-9a-f-]+)?)?|ask|sources|settings|players|entities(?:\/[^/]+)?|episodes\/[^/]+|fixtures)?\/?$/;
const publicApis = new Set(["/api/entities/search", "/api/syntheses"]);
export function publicRequestAllowed(pathname: string, method: string) {
  if (getAppCapabilities().mode === "private") return true;
  if (method !== "GET" && method !== "HEAD") return false;
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/squad") return getAppCapabilities().canViewSquad;
  return publicApis.has(path) || publicPages.test(path);
}
