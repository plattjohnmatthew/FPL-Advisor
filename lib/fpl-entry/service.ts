import "server-only";
import { OfficialFplEntryProvider } from "./official-provider";
import { FplSquadRepository } from "./repository";
import type { FplEntryProvider } from "./provider";
import type { FplSquadRefreshResult, StoredFplSquad } from "./types";
import { ensureSquadEntityMappings } from "./context";

type Repository = Pick<FplSquadRepository, "startRefresh" | "markUnavailable" | "markFailed" | "persist" | "getLatest">;
export class FplSquadService {
  constructor(private provider: FplEntryProvider = new OfficialFplEntryProvider(), private repository: Repository = new FplSquadRepository()) {}
  async refresh(entryId: number): Promise<FplSquadRefreshResult> {
    const runId = await this.repository.startRefresh(entryId);
    try {
      const result = await this.provider.fetchLatestPublicSquad(entryId);
      if (result.availability === "NO_PUBLIC_PICKS") {
        await this.repository.markUnavailable(runId, result.message);
        return { availability: "NO_PUBLIC_PICKS", message: result.message, nextGameweek: result.nextGameweek, latestSquad: await this.repository.getLatest(entryId) };
      }
      await this.repository.persist(runId, result);
      await ensureSquadEntityMappings(entryId);
      const squad = await this.repository.getLatest(entryId);
      if (!squad) throw new Error("The refreshed FPL squad could not be loaded.");
      return { availability: "PUBLIC_PICKS", squad };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown FPL refresh error.";
      await this.repository.markFailed(runId, message);
      const previous = await this.repository.getLatest(entryId);
      if (previous) return { availability: "STALE_PUBLIC_PICKS", message, squad: { ...previous, stale: true, refreshError: message } as StoredFplSquad };
      throw error;
    }
  }
}
