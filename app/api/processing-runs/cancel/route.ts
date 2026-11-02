import { disabledResponse } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { SupabaseProcessingRepository } from "@/lib/processing/supabase-repository";

export async function POST(request: Request) {
  const denied = disabledResponse("canProcessSources"); if (denied) return denied;

  try {
    const body = await request.json() as { runId?: unknown };
    if (typeof body.runId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.runId)) {
      return NextResponse.json({ error: "A valid processing run ID is required." }, { status: 400 });
    }
    const requested = await new SupabaseProcessingRepository().requestCancellation(body.runId);
    return requested
      ? NextResponse.json({ status: "CANCELLING" })
      : NextResponse.json({ error: "The run is no longer active." }, { status: 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to stop processing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
