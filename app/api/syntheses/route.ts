import { NextResponse } from "next/server";
import { createSynthesisService } from "@/lib/summaries/start-synthesis";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { scope?: unknown; fromDate?: unknown; toDate?: unknown; timezoneOffsetMinutes?: unknown };
    const service = createSynthesisService();
    if (body.scope === "LATEST_RUN") {
      return NextResponse.json(await service.synthesizeLatestRun(), { status: 201 });
    }
    if (body.scope === "DATE_RANGE") {
      if (typeof body.fromDate !== "string" || typeof body.toDate !== "string" || !DATE.test(body.fromDate) || !DATE.test(body.toDate) || body.fromDate > body.toDate) {
        return NextResponse.json({ error: "Choose a valid from/to publication date range." }, { status: 400 });
      }
      const offset = body.timezoneOffsetMinutes ?? 0;
      if (typeof offset !== "number" || !Number.isInteger(offset) || Math.abs(offset) > 840) {
        return NextResponse.json({ error: "Timezone offset is invalid." }, { status: 400 });
      }
      return NextResponse.json(await service.synthesizeDateRange(body.fromDate, body.toDate, offset), { status: 201 });
    }
    return NextResponse.json({ error: "Synthesis scope must be LATEST_RUN or DATE_RANGE." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
