import { NextResponse } from "next/server";
import { createSpecificUrlBatchService } from "@/lib/processing/start-url-batch";
import { RunAlreadyInProgressError } from "@/lib/processing/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.urls !== "string") return NextResponse.json({ error: "Paste YouTube video URLs as text." }, { status: 400 });
    return NextResponse.json(await createSpecificUrlBatchService().process(body.urls), { status: 201 });
  } catch (error) {
    if (error instanceof RunAlreadyInProgressError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "Unable to process the URL batch.";
    const validation = /Paste at least|no more than|YouTube video URLs/.test(message);
    return NextResponse.json({ error: message }, { status: validation ? 400 : 500 });
  }
}
