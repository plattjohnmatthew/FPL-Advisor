import { disabledResponse } from "@/lib/app-config";
import { after, NextResponse } from "next/server";
import { createSpecificUrlBatchService } from "@/lib/processing/start-url-batch";
import { RunAlreadyInProgressError } from "@/lib/processing/repository";

export async function POST(request: Request) {
  const denied = disabledResponse("canProcessSources"); if (denied) return denied;

  try {
    const body = await request.json();
    if (typeof body.urls !== "string") return NextResponse.json({ error: "Paste YouTube video URLs as text." }, { status: 400 });
    return NextResponse.json(await createSpecificUrlBatchService().start(body.urls, (work) => after(async () => { await work(); })), { status: 202 });
  } catch (error) {
    if (error instanceof RunAlreadyInProgressError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "Unable to process the URL batch.";
    const validation = /Paste at least|no more than|YouTube video URLs/.test(message);
    return NextResponse.json({ error: message }, { status: validation ? 400 : 500 });
  }
}
