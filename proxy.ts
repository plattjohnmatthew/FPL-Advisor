import { getAppCapabilities } from "@/lib/app-config";
import { publicRequestError, PUBLIC_CDN_CACHE } from "@/lib/public-request";
import { NextResponse, type NextRequest } from "next/server";
import { publicRequestAllowed } from "@/lib/app-config";
export function proxy(request: NextRequest) {
  if (!publicRequestAllowed(request.nextUrl.pathname, request.method)) {
    return NextResponse.json({ code: "PUBLIC_READ_ONLY", error: "This route is unavailable in the public research edition." }, { status: 403 });
  }
  const invalid = publicRequestError(request.nextUrl); if (invalid) return invalid;
  const response = NextResponse.next();
  if (getAppCapabilities().mode === "public_read_only" && !(request.nextUrl.pathname === "/ask" && request.nextUrl.searchParams.has("q"))) response.headers.set("Vercel-CDN-Cache-Control", PUBLIC_CDN_CACHE);
  return response;
}
export const config = { matcher: ["/((?!_next/static|favicon.ico|fonts/).*)"] };
