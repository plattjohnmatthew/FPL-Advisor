import { getAppCapabilities } from "@/lib/app-config";
import { AskWorkspace } from "./workspace";
import { initialResearchQuestion } from "@/lib/research/navigation";
import { DEFAULT_RESEARCH_SCOPE, RESEARCH_SCOPE_PRESETS, type ResearchScopePreset } from "@/lib/research/schema";
export const metadata = { title: "Ask AI | FPL Research", description: "Explore the research interface and prepare evidence-led FPL questions." };
export const dynamic = "force-dynamic";
export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; context?: string; scope?: string; from?: string; to?: string }> }) {
  const { q, context, scope, from, to } = await searchParams;
  const question = initialResearchQuestion(q);
  const initialScope = RESEARCH_SCOPE_PRESETS.includes(scope as ResearchScopePreset) ? scope as ResearchScopePreset : DEFAULT_RESEARCH_SCOPE;
  const initialMode = getAppCapabilities().canViewSquad && context === "MY_TEAM" ? "MY_TEAM" : "GLOBAL";
  return <AskWorkspace key={[question, initialScope, initialMode, from, to].join("|")} initialQuestion={question} initialScope={initialScope} initialMode={initialMode} initialFrom={from} initialTo={to} />;
}
