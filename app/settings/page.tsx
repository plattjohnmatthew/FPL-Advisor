import SettingsForm from "./settings-form";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await new SupabasePromptSettingsRepository().getAll();
  return <main className="detail-shell settings-shell" id="main-content">
    <header className="detail-header settings-header">
      <p className="section-number">Settings</p>
      <h1>AI instructions</h1>
      <p>Adjust what extraction notices and how reports are written. Grounding, evidence, provenance, taxonomy, and output rules always remain protected.</p>
    </header>
    <SettingsForm initialSettings={{ extraction: settings.EXTRACTION_CUSTOM_INSTRUCTIONS, synthesis: settings.SYNTHESIS_CUSTOM_INSTRUCTIONS }} />
  </main>;
}
