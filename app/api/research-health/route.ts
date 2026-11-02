import { disabledResponse } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { getResearchHealth } from "@/lib/processing/research-health";

export const dynamic = "force-dynamic";
export async function GET() {
  const denied = disabledResponse("canWriteData"); if (denied) return denied;

  try { return NextResponse.json(await getResearchHealth(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Research health is temporarily unavailable." }, { status: 503 }); }
}
