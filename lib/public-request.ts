import { getAppCapabilities } from "./app-config";
export const PUBLIC_EVIDENCE_LIMIT = 100;
export const PUBLIC_CDN_CACHE = "public, s-maxage=60, stale-while-revalidate=120";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validatePublicRequest(url: URL): string | null {
  if (getAppCapabilities().mode !== "public_read_only") return null;
  if (url.href.length > 4096) return "Public request URL is too long";
  const path = url.pathname.replace(/\/$/, "") || "/";
  const detail = path.match(/^\/(?:entities|episodes|intelligence\/briefings)\/([^/]+)$/);
  if (detail && !uuid.test(detail[1])) return "Invalid public record ID";
  const keys = path === "/api/entities/search" ? ["q"] : path === "/api/syntheses" ? ["from","to","id","tz"]
    : path === "/ask" ? ["q","scope","context","from","to"]
    : path === "/intelligence" ? ["q","from","to","creator","category","type","page","tz"]
    : path === "/intelligence/briefings" ? ["page"]
    : path.startsWith("/entities/") ? ["range","from","to","category","recommendation","creator","sort","owned"]
    : path.startsWith("/episodes/") ? ["range","from","to","category","recommendation","entity","returnTo"]
    : ["/players","/entities"].includes(path) ? ["q","range","from","to"] : [];
  const seen = new Set<string>();
  for (const [key,value] of url.searchParams) {
    if (seen.has(key) || (key !== "_rsc" && !keys.includes(key))) return "Unsupported or duplicate public query parameter";
    seen.add(key);
    const max = key === "returnTo" ? 2048 : key === "q" ? path === "/ask" ? 1000 : path === "/api/entities/search" ? 100 : 200 : 80;
    if (value.length > max) return "Public query value is too long";
    if (key === "page" && (!/^\d{1,4}$/.test(value) || Number(value)<1 || Number(value)>1000)) return "Public page must be between 1 and 1000";
    if (["id","creator","entity"].includes(key) && value && !uuid.test(value)) return "Invalid public record ID";
    if (["from","to"].includes(key) && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))) return "Invalid public date";
  }
  return null;
}
export function publicRequestError(url: URL): Response | null {
  const error = validatePublicRequest(url);
  return error ? Response.json({error,code:"PUBLIC_REQUEST_LIMIT"},{status:400,headers:{"Cache-Control":"no-store"}}) : null;
}
