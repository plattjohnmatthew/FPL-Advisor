import { disabledResponse } from "@/lib/app-config";
import { after, NextResponse } from "next/server";
import { controlEpisode, type EpisodeControlAction } from "@/lib/processing/episode-control";
import { RunAlreadyInProgressError } from "@/lib/processing/repository";

const ACTIONS = new Set<EpisodeControlAction>(["PAUSE", "RESUME", "RETRY", "CANCEL", "DISMISS"]);
export async function POST(request: Request, context: RouteContext<"/api/episodes/[episodeId]/processing">) {
  const denied = disabledResponse("canRetryJobs"); if (denied) return denied;

  try {
    const [{ episodeId }, body] = await Promise.all([context.params, request.json()]);
    const action = body?.action as EpisodeControlAction;
    if (!ACTIONS.has(action)) return NextResponse.json({ error: "Episode action must be PAUSE, RESUME, RETRY, CANCEL, or DISMISS." }, { status: 400 });
    return NextResponse.json(await controlEpisode(episodeId, action, (work) => after(async () => { await work(); })));
  } catch (error) {
    if (error instanceof RunAlreadyInProgressError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "Unable to update episode processing.";
    return NextResponse.json({ error: message }, { status: /not found|not retried/i.test(message) ? 400 : 500 });
  }
}
