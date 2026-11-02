import { publicRequestError } from "@/lib/public-request";
import { disabledResponse } from "@/lib/app-config";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createSynthesisService } from "@/lib/summaries/start-synthesis";
import { NoEligibleContentError } from "@/lib/summaries/service";
import { getBriefing } from "@/lib/intelligence/briefing";
import { localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const invalid = publicRequestError(new URL(request.url)); if (invalid) return invalid;
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? ""; const to = params.get("to") ?? "";
    const offset = Number(params.get("tz") ?? 0);
    localDateRangeToUtcBounds(from, to, offset);
    const id = params.get("id") ?? undefined;
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid briefing ID." }, { status: 400 });
    return NextResponse.json({ briefing: await getBriefing(from, to, id, offset) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load briefing." }, { status: 400 });
  }
}

function invalidateBriefings() {
  revalidatePath("/");
  revalidatePath("/intelligence");
  revalidatePath("/intelligence/briefings");
}

export async function POST(request: Request) {
  const denied = disabledResponse("canGenerateBriefings"); if (denied) return denied;

  try {
    const body = await request.json() as { scope?: unknown; fromDate?: unknown; toDate?: unknown; timezoneOffsetMinutes?: unknown };
    const service = createSynthesisService();
    if (body.scope === "LATEST_RUN") {
      const result = await service.synthesizeLatestRun();
      invalidateBriefings();
      return NextResponse.json(result, { status: 201 });
    }
    if (body.scope === "DATE_RANGE") {
      if (typeof body.fromDate !== "string" || typeof body.toDate !== "string" || !DATE.test(body.fromDate) || !DATE.test(body.toDate) || body.fromDate > body.toDate) {
        return NextResponse.json({ error: "Choose a valid from/to publication date range." }, { status: 400 });
      }
      const offset = body.timezoneOffsetMinutes ?? 0;
      if (typeof offset !== "number" || !Number.isInteger(offset) || Math.abs(offset) > 840) {
        return NextResponse.json({ error: "Timezone offset is invalid." }, { status: 400 });
      }
      try { localDateRangeToUtcBounds(body.fromDate, body.toDate, offset); } catch {
        return NextResponse.json({ error: "Choose a valid from/to publication date range." }, { status: 400 });
      }
      const result = await service.synthesizeDateRange(body.fromDate, body.toDate, offset);
      invalidateBriefings();
      return NextResponse.json(result, { status: 201 });
    }
    return NextResponse.json({ error: "Synthesis scope must be LATEST_RUN or DATE_RANGE." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed.";
    return NextResponse.json({ error: message, ...(error instanceof NoEligibleContentError ? { code: "NO_ELIGIBLE_CONTENT" } : {}) }, { status: error instanceof NoEligibleContentError ? 422 : 500 });
  }
}
