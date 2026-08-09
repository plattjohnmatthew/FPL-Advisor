import Dashboard from "./dashboard";
import { emptyDashboardSnapshot, getDashboardSnapshot } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot;

  try {
    snapshot = await getDashboardSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dashboard data.";
    snapshot = emptyDashboardSnapshot(message);
  }

  return <Dashboard initialSnapshot={snapshot} />;
}
