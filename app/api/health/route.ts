import { disabledResponse } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { checkSupabaseHealth } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = disabledResponse("canWriteData"); if (denied) return denied;

  const health = await checkSupabaseHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}

