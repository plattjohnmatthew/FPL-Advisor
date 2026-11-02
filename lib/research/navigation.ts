export const OVERVIEW_PROMPTS = [
  "What are creators saying about captaincy?",
  "Which transfers are gaining attention?",
  "What's changed in the last seven days?",
] as const;

export function initialResearchQuestion(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] ?? "" : value ?? "").trim().slice(0, 1000);
}
export function researchQuestionHref(question: string, options: { context?: "MY_TEAM"; scope?: string; from?: string; to?: string } = {}) {
  const params = new URLSearchParams({ q: initialResearchQuestion(question) });
  for (const [key, value] of Object.entries(options)) if (value) params.set(key, value);
  return `/ask?${params}`;
}

export const SQUAD_RESEARCH_ACTIONS = [
  { label: "Analyze my squad", question: "Analyze the strengths and risks in my currently selected squad using creator evidence." },
  { label: "Research my captaincy options", question: "Compare captaincy options among the players in my selected squad using creator evidence." },
  { label: "Find creator opinions about my players", question: "What are creators saying about the players in my currently selected squad?" },
  { label: "Explore potential transfers", question: "Which non-owned replacements for my selected squad have supporting creator evidence, and what are the trade-offs?" },
].map((item) => ({ ...item, href: researchQuestionHref(item.question, { context: "MY_TEAM", scope: "LAST_14_DAYS" }) }));

export const DECISION_SHORTCUTS = [
  { label: "Captaincy", description: "Compare the creator views", href: researchQuestionHref(OVERVIEW_PROMPTS[0]) },
  { label: "Transfers", description: "See what is gaining attention", href: researchQuestionHref(OVERVIEW_PROMPTS[1]) },
  { label: "My Squad", description: "Research around your saved team", href: "/squad" },
  { label: "Players to Watch", description: "Explore the research watchlist", href: researchQuestionHref("Which players should I watch based on recent creator research?") },
] as const;
