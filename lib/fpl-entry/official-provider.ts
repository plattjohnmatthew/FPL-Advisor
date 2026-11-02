import { requireCapability } from "@/lib/app-config";
import "server-only";
import { z } from "zod";
import { FPL_BOOTSTRAP_URL, fplEntryHistoryUrl, fplEntryPicksUrl, fplEntryUrl } from "@/lib/fpl/endpoints";
import type { FplEntryProvider } from "./provider";
import type { FplEntryMetadata, FplSquadFetchResult } from "./types";

const EntrySchema = z.object({ id: z.number().int().positive(), name: z.string().min(1), player_first_name: z.string(), player_last_name: z.string(), started_event: z.number().int().min(1).max(38), summary_overall_points: z.number().int().nullable(), summary_overall_rank: z.number().int().nullable() });
const HistorySchema = z.object({ current: z.array(z.object({ event: z.number().int().min(1).max(38) }).passthrough()) });
const BootstrapEventsSchema = z.object({ events: z.array(z.object({ id: z.number().int().min(1).max(38), deadline_time: z.string().datetime(), is_next: z.boolean() })) });
const PicksSchema = z.object({ active_chip: z.string().nullable(), entry_history: z.object({ event: z.number().int(), points: z.number().int().nullable(), total_points: z.number().int().nullable(), overall_rank: z.number().int().nullable() }), picks: z.array(z.object({ element: z.number().int().positive(), position: z.number().int().min(1).max(15), multiplier: z.number().int().nonnegative(), is_captain: z.boolean(), is_vice_captain: z.boolean() })).length(15) });

export class FplEntryNotFoundError extends Error { constructor(entryId: number) { super(`FPL entry ${entryId} does not exist or is not publicly available.`); this.name = "FplEntryNotFoundError"; } }

export class OfficialFplEntryProvider implements FplEntryProvider {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => Date = () => new Date()) {}
  private async json(url: string) { return this.fetcher(url, { headers: { Accept: "application/json", "User-Agent": "FPL-Research/1.0" }, signal: AbortSignal.timeout(20_000), cache: "no-store" }); }
  async fetchLatestPublicSquad(entryId: number): Promise<FplSquadFetchResult> {
    requireCapability("canRefreshFpl");
    const [entryResponse, historyResponse, bootstrapResponse] = await Promise.all([this.json(fplEntryUrl(entryId)), this.json(fplEntryHistoryUrl(entryId)), this.json(FPL_BOOTSTRAP_URL)]);
    if (entryResponse.status === 404) throw new FplEntryNotFoundError(entryId);
    if (!entryResponse.ok) throw new Error(`FPL entry request failed with HTTP ${entryResponse.status}.`);
    if (!historyResponse.ok) throw new Error(`FPL entry history request failed with HTTP ${historyResponse.status}.`);
    if (!bootstrapResponse.ok) throw new Error(`FPL event lookup failed with HTTP ${bootstrapResponse.status}.`);
    const entry = EntrySchema.parse(await entryResponse.json()); const history = HistorySchema.parse(await historyResponse.json()); const bootstrap = BootstrapEventsSchema.parse(await bootstrapResponse.json());
    const metadata: FplEntryMetadata = { entryId: entry.id, entryName: entry.name, managerName: `${entry.player_first_name} ${entry.player_last_name}`.trim(), startedEvent: entry.started_event, overallPoints: entry.summary_overall_points, overallRank: entry.summary_overall_rank };
    const deadlinePassed = bootstrap.events.filter((event) => event.id >= entry.started_event && new Date(event.deadline_time) <= this.now()).map((event) => event.id);
    const candidates = [...new Set([...history.current.map((row) => row.event), ...deadlinePassed])].sort((a, b) => b - a);
    for (const gameweek of candidates) {
      const response = await this.json(fplEntryPicksUrl(entryId, gameweek)); if (response.status === 404) continue; if (!response.ok) throw new Error(`FPL picks request for Gameweek ${gameweek} failed with HTTP ${response.status}.`);
      const picks = PicksSchema.parse(await response.json());
      return { availability: "PUBLIC_PICKS", entry: metadata, gameweek, activeChip: picks.active_chip, eventPoints: picks.entry_history.points, totalPoints: picks.entry_history.total_points, overallRank: picks.entry_history.overall_rank, retrievedAt: this.now().toISOString(), picks: picks.picks.map((pick) => ({ fplPlayerId: pick.element, squadPosition: pick.position, multiplier: pick.multiplier, isCaptain: pick.is_captain, isViceCaptain: pick.is_vice_captain, benchOrder: pick.position > 11 ? pick.position - 11 : null })) };
    }
    const nextGameweek = bootstrap.events.find((event) => event.is_next)?.id ?? null;
    return { availability: "NO_PUBLIC_PICKS", entry: metadata, gameweek: null, nextGameweek, retrievedAt: this.now().toISOString(), message: nextGameweek ? `Gameweek ${nextGameweek} picks are not public before the deadline. No earlier 2026/27 picks are available yet.` : "No publicly available picks were found for this entry." };
  }
}
