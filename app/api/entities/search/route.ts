import { publicRequestError } from "@/lib/public-request";
import { searchEntities } from "@/lib/entities/repository";

export async function GET(request: Request) {
  const invalid = publicRequestError(new URL(request.url)); if (invalid) return invalid;
  try {
    const q = new URL(request.url).searchParams.get("q")?.slice(0, 100) ?? "";
    return Response.json({ results: await searchEntities(q) });
  } catch {
    return Response.json({ error: "Player and team search is unavailable. Please try again." }, { status: 503 });
  }
}
