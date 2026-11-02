import { disabledResponse } from "@/lib/app-config";
import { after, NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/dashboard/data";
import { RunAlreadyInProgressError } from "@/lib/processing/repository";
import { startProcessingRun } from "@/lib/processing/start-run";
import { parseProcessingRunRequest } from "@/lib/processing/options";

export async function GET(request: Request) {
  const denied = disabledResponse("canWriteData"); if (denied) return denied;

  try {
    const searchParams = new URL(request.url).searchParams;
    const rawOffset = searchParams.get("timezoneOffsetMinutes");
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    if (!Number.isInteger(offset) || Math.abs(offset) > 840) return NextResponse.json({ error: "Timezone offset is invalid." }, { status: 400 });
    const fromDate = searchParams.get("synthesisFromDate");
    const toDate = searchParams.get("synthesisToDate");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if ((fromDate === null) !== (toDate === null) || (fromDate && toDate && (!datePattern.test(fromDate) || !datePattern.test(toDate) || fromDate > toDate))) {
      return NextResponse.json({ error: "Synthesis display period is invalid." }, { status: 400 });
    }
    return NextResponse.json(await getDashboardSnapshot(offset, new Date(), fromDate && toDate ? { fromDate, toDate } : undefined));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load processing status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = disabledResponse("canProcessSources"); if (denied) return denied;

  try {
    const result = await startProcessingRun(parseProcessingRunRequest(await request.json()), (work) => after(async () => { await work(); }));
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof RunAlreadyInProgressError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Unable to start processing run.";
    const configurationError = /date|timezone|YouTube videos|scope|creator|selected source/i.test(message);
    return NextResponse.json({ error: message }, { status: configurationError ? 400 : 500 });
  }
}
