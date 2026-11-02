import { getAppCapabilities } from "@/lib/app-config";
import { HowItWorks } from "@/components/how-it-works";
import SettingsForm from "./settings-form";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";
import { getLatestFplSyncStatus } from "@/lib/fpl/repository";

export const metadata = { title: "How it works | FPL Research", description: "Understand the evidence-led research workflow and run the full product locally." };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (getAppCapabilities().mode === "public_read_only") return <HowItWorks />;
  const [settings, fplSync] = await Promise.all([new SupabasePromptSettingsRepository().getAll(), getLatestFplSyncStatus()]);
  return <main className="detail-shell settings-shell" id="main-content">
    <header className="detail-header settings-header">
      <p className="section-number">Settings</p>
      <h1>AI instructions</h1>
      <p>Adjust what extraction notices and how reports are written. Grounding, evidence, provenance, taxonomy, and output rules always remain protected.</p>
    </header>
    <SettingsForm initialSettings={{ extraction: settings.EXTRACTION_CUSTOM_INSTRUCTIONS, synthesis: settings.SYNTHESIS_CUSTOM_INSTRUCTIONS }} initialFplSync={fplSync} />
  </main>;
}
