import { disabledResponse } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { createFplResearchService } from "@/lib/research/start";
import { DEFAULT_RESEARCH_SCOPE, RESEARCH_SCOPE_PRESETS, type ResearchContextMode, type ResearchScopePreset } from "@/lib/research/schema";

export async function POST(request: Request) {
  const denied = disabledResponse("canAskAI"); if (denied) return denied;

  try {
    const body = await request.json() as { question?: unknown; scope?: unknown; contextMode?: unknown; fromDate?: unknown; toDate?: unknown; timezoneOffsetMinutes?: unknown };
    if (typeof body.question !== "string") {
      return NextResponse.json({ error: "A question is required." }, { status: 400 });
    }
    const preset = body.scope ?? DEFAULT_RESEARCH_SCOPE;
    if (typeof preset !== "string" || !RESEARCH_SCOPE_PRESETS.includes(preset as ResearchScopePreset)) return NextResponse.json({ error: "Choose a valid research time scope." }, { status: 400 });
    const timezoneOffsetMinutes = body.timezoneOffsetMinutes ?? 0;
    if (typeof timezoneOffsetMinutes !== "number") return NextResponse.json({ error: "Timezone offset is invalid." }, { status: 400 });
    const contextMode: ResearchContextMode = body.contextMode === "MY_TEAM" ? "MY_TEAM" : "GLOBAL";
    return NextResponse.json(await createFplResearchService().ask(body.question, {
      preset: preset as ResearchScopePreset,
      fromDate: typeof body.fromDate === "string" ? body.fromDate : undefined,
      toDate: typeof body.toDate === "string" ? body.toDate : undefined,
      timezoneOffsetMinutes,
    }, contextMode));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to answer the research question.";
    const status = /between 3 and 1000|required/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
