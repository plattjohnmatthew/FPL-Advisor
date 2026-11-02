import type { FplDataProvider } from "./provider";
import type { FplRepository } from "./repository";
export class FplSyncService {
  constructor(private readonly provider: FplDataProvider, private readonly repository: FplRepository) {}
  async sync() { const runId = await this.repository.startSync(); try { return await this.repository.completeSync(runId, await this.provider.fetchSnapshot()); } catch (cause) { const message = cause instanceof Error ? cause.message : "Unknown FPL sync failure."; await this.repository.failSync(runId, message); throw new Error(message); } }
}
