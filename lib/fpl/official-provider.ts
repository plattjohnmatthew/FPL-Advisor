import { requireCapability } from "@/lib/app-config";
import "server-only";
import { z } from "zod";
import type { FplDataProvider } from "./provider";
import type { FplPosition, FplSnapshot } from "./types";
import { FPL_BOOTSTRAP_URL, FPL_FIXTURES_URL } from "./endpoints";

const TeamSchema = z.object({ id: z.number().int().positive(), name: z.string().min(1), short_name: z.string().min(1), code: z.number().int().nullable().optional() });
const PositionSchema = z.object({ id: z.number().int().positive(), singular_name_short: z.string().min(1) });
const PlayerSchema = z.object({ id: z.number().int().positive(), web_name: z.string().min(1), first_name: z.string(), second_name: z.string(), known_name: z.string().nullable().optional(), team: z.number().int().positive(), element_type: z.number().int().positive(), now_cost: z.number().int().nonnegative(), cost_change_event: z.number().int(), cost_change_start: z.number().int(), transfers_in: z.number().int().nonnegative(), transfers_out: z.number().int().nonnegative(), transfers_in_event: z.number().int().nonnegative(), transfers_out_event: z.number().int().nonnegative(), status: z.string().nullable().optional(), can_select: z.boolean(), can_transact: z.boolean(), removed: z.boolean() });
const BootstrapSchema = z.object({ teams: z.array(TeamSchema), element_types: z.array(PositionSchema), elements: z.array(PlayerSchema), events: z.array(z.object({ id: z.number().int().min(1).max(38), is_current: z.boolean(), is_next: z.boolean() })) });
const FixturesSchema = z.array(z.object({ id: z.number().int().positive(), event: z.number().int().min(1).max(38).nullable(), kickoff_time: z.string().datetime().nullable(), team_h: z.number().int().positive(), team_a: z.number().int().positive(), team_h_difficulty: z.number().int().min(1).max(5), team_a_difficulty: z.number().int().min(1).max(5), finished: z.boolean(), started: z.boolean() }));

export function normalizePosition(label: string): FplPosition {
  const value = label === "GKP" ? "GK" : label;
  if (!(["GK", "DEF", "MID", "FWD"] as string[]).includes(value)) throw new Error(`Unsupported FPL position: ${label}`);
  return value as FplPosition;
}
export function normalizePrice(nowCost: number) { return Number((nowCost / 10).toFixed(1)); }
export function canonicalPlayerName(player: { first_name: string; second_name: string; known_name?: string | null }) {
  return player.known_name?.trim() || `${player.first_name} ${player.second_name}`.trim();
}

export class OfficialFplDataProvider implements FplDataProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async fetchSnapshot(): Promise<FplSnapshot> {
    requireCapability("canRefreshFpl");
    const request = { headers: { Accept: "application/json", "User-Agent": "FPL-Research/1.0" }, signal: AbortSignal.timeout(20_000), cache: "no-store" as const };
    const [response, fixturesResponse] = await Promise.all([this.fetcher(FPL_BOOTSTRAP_URL, request), this.fetcher(FPL_FIXTURES_URL, request)]);
    if (!response.ok) throw new Error(`FPL bootstrap request failed with HTTP ${response.status}.`);
    if (!fixturesResponse.ok) throw new Error(`FPL fixtures request failed with HTTP ${fixturesResponse.status}.`);
    const parsed = BootstrapSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`FPL bootstrap response validation failed: ${parsed.error.issues[0]?.message ?? "unknown shape"}`);
    const parsedFixtures = FixturesSchema.safeParse(await fixturesResponse.json());
    if (!parsedFixtures.success) throw new Error(`FPL fixtures response validation failed: ${parsedFixtures.error.issues[0]?.message ?? "unknown shape"}`);
    const positions = new Map(parsed.data.element_types.map((item) => [item.id, normalizePosition(item.singular_name_short)]));
    return {
      fetchedAt: new Date().toISOString(),
      eventId: (parsed.data.events.find((event) => event.is_current) ?? parsed.data.events.find((event) => event.is_next))?.id ?? null,
      teams: parsed.data.teams.map((team) => ({ fplTeamId: team.id, name: team.name, shortName: team.short_name, code: team.code ?? null })),
      fixtures: parsedFixtures.data.map((fixture) => ({ fplFixtureId: fixture.id, eventId: fixture.event, kickoffTime: fixture.kickoff_time, homeTeamId: fixture.team_h, awayTeamId: fixture.team_a, homeDifficulty: fixture.team_h_difficulty, awayDifficulty: fixture.team_a_difficulty, finished: fixture.finished, started: fixture.started })),
      players: parsed.data.elements.map((player) => {
        const position = positions.get(player.element_type); if (!position) throw new Error(`FPL player ${player.id} references unknown position ${player.element_type}.`);
        return { fplPlayerId: player.id, webName: player.web_name, firstName: player.first_name, secondName: player.second_name, knownName: player.known_name?.trim() || null, canonicalName: canonicalPlayerName(player), fplTeamId: player.team, position, currentPrice: normalizePrice(player.now_cost), eventPriceChange: normalizePrice(player.cost_change_event), startPriceChange: normalizePrice(player.cost_change_start), transfersIn: player.transfers_in, transfersOut: player.transfers_out, transfersInEvent: player.transfers_in_event, transfersOutEvent: player.transfers_out_event, status: player.status ?? null, canSelect: player.can_select, canTransact: player.can_transact, removed: player.removed };
      }),
    };
  }
}
