import { disabledResponse } from "@/lib/app-config";
import { OfficialFplDataProvider } from "@/lib/fpl/official-provider";
import { SupabaseFplRepository } from "@/lib/fpl/repository";
import { FplSyncService } from "@/lib/fpl/sync-service";
export async function POST() {
  const denied = disabledResponse("canRefreshFpl"); if (denied) return denied;
 try { return Response.json(await new FplSyncService(new OfficialFplDataProvider(), new SupabaseFplRepository()).sync(), { status: 201 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "FPL sync failed." }, { status: 500 }); } }
