import Dashboard from "@/app/dashboard";
import { emptyDashboardSnapshot, getDashboardSnapshot } from "@/lib/dashboard/data";
import { initialResearchQuestion } from "@/lib/research/navigation";

export type DashboardView = "overview" | "intelligence" | "ask" | "sources";
export type ResearchPageProps = { searchParams: Promise<{ from?: string; to?: string; q?: string | string[] }> };

export async function ResearchPage({ searchParams, view = "overview" }: ResearchPageProps & { view?: DashboardView }) {
  let snapshot;
  let question = "";
  try {
    const { from, to, q } = await searchParams;
    if (view === "ask") question = initialResearchQuestion(q);
    if ((from || to) && (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)) throw new Error("Choose a valid episode date range.");
    snapshot = await getDashboardSnapshot(0, new Date(), from && to ? { fromDate: from, toDate: to } : undefined);
  } catch (error) {
    snapshot = emptyDashboardSnapshot(error instanceof Error ? error.message : "Unable to load dashboard data.");
  }
  return <Dashboard key={view === "ask" ? question : undefined} initialSnapshot={snapshot} view={view} initialQuestion={question} />;
}
