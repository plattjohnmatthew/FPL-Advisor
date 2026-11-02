"use client";

import { useState } from "react";
import type { PromptSetting } from "@/lib/prompt-settings/config";

type SyncStatus = { id: string; status: string; started_at: string; completed_at: string | null; player_count: number; team_count: number; error_message: string | null } | null;
export default function SettingsForm({ initialSettings, initialFplSync }: { initialSettings: { extraction: PromptSetting; synthesis: PromptSetting }; initialFplSync: SyncStatus }) {
  const [extractionInstructions, setExtractionInstructions] = useState(initialSettings.extraction.value);
  const [synthesisInstructions, setSynthesisInstructions] = useState(initialSettings.synthesis.value);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(initialFplSync);
  const [isSyncing, setIsSyncing] = useState(false);

  async function update(method: "PUT" | "DELETE") {
    setIsSaving(true); setMessage(null); setError(null);
    try {
      const response = await fetch("/api/prompt-settings", { method, headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined, body: method === "PUT" ? JSON.stringify({ extractionInstructions, synthesisInstructions }) : undefined });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save AI instructions.");
      setExtractionInstructions(body.settings.EXTRACTION_CUSTOM_INSTRUCTIONS.value);
      setSynthesisInstructions(body.settings.SYNTHESIS_CUSTOM_INSTRUCTIONS.value);
      setMessage(method === "DELETE" ? "Default instructions restored. Existing outputs were not changed." : "Instructions saved. They apply only to future AI calls.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save AI instructions."); }
    finally { setIsSaving(false); }
  }

  async function syncFplData() { setIsSyncing(true); setError(null); try { const response = await fetch("/api/fpl-sync", { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "FPL data sync failed."); setSyncStatus({ id: body.runId, status: body.status, started_at: body.completedAt, completed_at: body.completedAt, player_count: body.playerCount, team_count: body.teamCount, error_message: null }); } catch (cause) { setError(cause instanceof Error ? cause.message : "FPL data sync failed."); } finally { setIsSyncing(false); } }

  return <><section className="settings-card fpl-sync-card" aria-labelledby="fpl-sync-heading"><div className="settings-intro"><h2 id="fpl-sync-heading">Current FPL player data</h2><p>Refresh authoritative player names, teams, positions and prices. Each completed refresh preserves one price observation per player.</p></div><button type="button" onClick={() => void syncFplData()} disabled={isSyncing}>{isSyncing ? "Refreshing FPL data…" : "Refresh FPL data"}</button>{syncStatus ? <p className="helper-text">Latest sync: {syncStatus.status} · {syncStatus.player_count} players · {syncStatus.team_count} teams{syncStatus.completed_at ? ` · ${new Date(syncStatus.completed_at).toLocaleString()}` : ""}</p> : <p className="helper-text">FPL data has not been synchronized yet.</p>}</section><section className="settings-card" aria-labelledby="prompt-settings-heading">
    <div className="settings-intro"><h2 id="prompt-settings-heading">Prompt preferences</h2><p>These preferences change emphasis and style. Saving does not call OpenAI or alter existing outputs.</p></div>
    <div className="instruction-fields">
      <label>Insight extraction instructions<textarea value={extractionInstructions} onChange={(event) => setExtractionInstructions(event.target.value)} maxLength={4000} rows={8} disabled={isSaving} /><small>Applies to future episode extractions only.</small></label>
      <label>Synthesis and report instructions<textarea value={synthesisInstructions} onChange={(event) => setSynthesisInstructions(event.target.value)} maxLength={4000} rows={8} disabled={isSaving} /><small>Existing reports remain unchanged until you explicitly regenerate one.</small></label>
    </div>
    <div className="instruction-actions"><button type="button" onClick={() => void update("PUT")} disabled={isSaving}>{isSaving ? "Saving…" : "Save instructions"}</button><button type="button" className="secondary-button" onClick={() => void update("DELETE")} disabled={isSaving}>Reset to default</button></div>
    {message && <p className="source-message" role="status">{message}</p>}{error && <p className="episode-error" role="alert">{error}</p>}
  </section></>;
}
