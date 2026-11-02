import { FPL_INSIGHT_EXTRACTION_PROMPT } from "../lib/insights/prompt";
import { EXTRACTION_CITATION_REPAIR_PROMPT } from "../lib/insights/citation-repair-prompt";
import { RUN_SUMMARY_PROMPT } from "../lib/summaries/prompt";
import { CREATOR_REDUCTION_PROMPT } from "../lib/summaries/reduction-prompt";
import { QUERY_INTERPRETATION_PROMPT, RESEARCH_ANSWER_PROMPT } from "../lib/research/prompts";
import { SPLIT_DETECTION_PROMPT } from "../lib/splits/prompt";
import { loadEnvConfig } from "@next/env";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SupabasePromptSettingsRepository } from "../lib/prompt-settings/repository";
import { readSnapshot } from "../lib/public-snapshot/storage";
import { publicSnapshotFiles } from "../lib/public-snapshot/transport";
import { assertPublicText } from "./public-secrets.mjs";
loadEnvConfig(process.cwd());
async function files(dir:string):Promise<string[]> {return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(row=>row.isDirectory()?files(join(dir,row.name)):[join(dir,row.name)]))).flat();}
async function main() {
  if(process.env.APP_MODE!=="private")throw new Error("Run the private local auditor with APP_MODE=private; it performs one SELECT of saved prompt settings");
  const settings=await new SupabasePromptSettingsRepository().getAll();
  const known=Object.entries(process.env).filter(([key,value])=>/(KEY|TOKEN|SECRET|PASSWORD)$/.test(key)&&value&&value.length>=12).map(([,value])=>value!);
  const instructions=Object.values(settings).map(row=>row.value).filter(value=>value.trim().length>=12);
  const protectedPrompts=[FPL_INSIGHT_EXTRACTION_PROMPT,EXTRACTION_CITATION_REPAIR_PROMPT,RUN_SUMMARY_PROMPT,CREATOR_REDUCTION_PROMPT,QUERY_INTERPRETATION_PROMPT,RESEARCH_ANSWER_PROMPT,SPLIT_DETECTION_PROMPT];
  const sensitive=[...known,...instructions,...protectedPrompts];
  const snapshot=await readSnapshot();assertPublicText(JSON.stringify(snapshot),sensitive);
  const transport=publicSnapshotFiles(snapshot);assertPublicText(transport.serialized,sensitive);for(const chunk of transport.chunks)assertPublicText(chunk.serialized,sensitive);
  const browserFiles=(await files(join(process.cwd(),process.env.FPL_NEXT_DIST_DIR||".next","static"))).filter(file=>/\.(js|map|json)$/.test(file));
  for(const file of browserFiles)assertPublicText(await readFile(file,"utf8"),sensitive);
  const surfaces=JSON.parse(await readFile(".security-http-surfaces.json","utf8")) as Array<{path:string;body:string}>;
  for(const surface of surfaces)assertPublicText(surface.body,sensitive);
  const report={snapshot:snapshot.id,privatePromptSettingsChecked:instructions.length,protectedPromptsChecked:protectedPrompts.length,knownSecretValuesChecked:known.length,browserArtifacts:browserFiles.length,htmlAndNetworkSurfaces:surfaces.length,publicInsightObjects:transport.chunks.length,maxInsightsPerObject:100,result:"PASS",operationalDatabaseAccess:"one private auditor SELECT; never a public request"};
  await writeFile("docs/public-secret-audit.json",JSON.stringify(report,null,2)+"\n");console.log("Public secret audit passed; no secret or instruction values were printed.");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Public secret audit failed");process.exitCode=1;});
