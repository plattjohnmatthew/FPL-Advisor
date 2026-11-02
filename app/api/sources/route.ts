import { disabledResponse } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { SupabaseSourceLibraryRepository } from "@/lib/sources/repository";
import { YouTubeChannelResolver } from "@/lib/sources/youtube-channel-resolver";

export async function PATCH(request: Request) {
  const denied = disabledResponse("canProcessSources"); if (denied) return denied;

  try {
    const body = await request.json();
    if (!Array.isArray(body.selectedSourceIds) || body.selectedSourceIds.some((id: unknown) => typeof id !== "string")) throw new Error("Creator selection is invalid.");
    await new SupabaseSourceLibraryRepository().setSelection(body.selectedSourceIds);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save creator selection." }, { status: 400 }); }
}

export async function POST(request: Request) {
  const denied = disabledResponse("canProcessSources"); if (denied) return denied;

  try {
    const body = await request.json();
    if (typeof body.channelUrl !== "string") throw new Error("Enter a YouTube channel URL.");
    const channel = await new YouTubeChannelResolver().resolve(body.channelUrl);
    const result = await new SupabaseSourceLibraryRepository().upsertYouTube(channel);
    return NextResponse.json({ ...result, message: result.existed ? "Creator already exists and has been selected." : "Creator added and selected." }, { status: result.existed ? 200 : 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add creator." }, { status: 400 }); }
}
