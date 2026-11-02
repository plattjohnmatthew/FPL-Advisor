import { disabledResponse } from "@/lib/app-config";
import { NextResponse } from "next/server";
import { validateCustomInstructions } from "@/lib/prompt-settings/config";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";

export async function PUT(request: Request) {
  const denied = disabledResponse("canEditSettings"); if (denied) return denied;

  try {
    const body = await request.json();
    const extraction = validateCustomInstructions(body.extractionInstructions, "Insight extraction instructions");
    const synthesis = validateCustomInstructions(body.synthesisInstructions, "Synthesis instructions");
    const settings = await new SupabasePromptSettingsRepository().save(extraction, synthesis);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save AI instructions." }, { status: 400 });
  }
}

export async function DELETE() {
  const denied = disabledResponse("canEditSettings"); if (denied) return denied;

  try {
    const settings = await new SupabasePromptSettingsRepository().reset();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reset AI instructions." }, { status: 500 });
  }
}
