export const SHOWCASE_DESCRIPTIONS: Record<string,string> = {
  "Generate briefing":"Live briefing generation is disabled in the public showcase. The full version generates analysis using your own configured OpenAI API key.",
  "Regenerate briefing":"Live briefing generation is disabled here. Existing published versions remain available to explore.",
  "Ask AI":"Live AI research is disabled in this public showcase. Run the project locally with your own OpenAI key to use this feature.",
  "Process URLs":"Content ingestion is disabled in the public showcase. The full version processes YouTube URLs and creator feeds using your configured transcript provider.",
  "Process creators":"Creator ingestion is available in the full version and uses the transcript-processing pipeline configured locally.",
  "Refresh My Squad":"Live FPL refresh is disabled in the public showcase. The full version can load and persist your own FPL entry.",
  "Retry processing":"Processing jobs cannot run in the public showcase. Retry and recovery controls are available locally.",
};
export function runShowcaseAction(isPublic:boolean, show:(action:string,description?:string)=>void, action:string, execute:()=>void, description?:string) {
  if (isPublic) { show(action,description); return false; }
  execute(); return true;
}
export function getShowcaseLinks() {
  const raw=process.env.NEXT_PUBLIC_GITHUB_REPO_URL || "https://github.com/plattjohnmatthew/FPL-Advisor";
  const url=new URL(raw);
  if (url.protocol!=="https:" || url.hostname!=="github.com" || url.username || url.password) throw new Error("NEXT_PUBLIC_GITHUB_REPO_URL must be an HTTPS GitHub repository URL");
  const github=url.href.replace(/\/$/,"");
  return {github,setup:`${github}#local-setup`};
}
