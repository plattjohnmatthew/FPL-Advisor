import { assertPublicText } from "./public-secrets.mjs";
import { readFile } from "node:fs/promises";
import nextEnvironment from "@next/env";
const { loadEnvConfig } = nextEnvironment;
import { createServer, request } from "node:http";
import { writeFile } from "node:fs/promises";
import { publicBuildEnvironment } from "./public-environment.mjs";
loadEnvConfig(process.cwd());
const sensitiveValues=Object.entries(process.env).filter(([key,value])=>/(KEY|TOKEN|SECRET|PASSWORD)$/.test(key)&&value&&value.length>=12).map(([,value])=>value);
Object.assign(process.env, publicBuildEnvironment());
process.env.NODE_ENV = "production";
const originalFetch = globalThis.fetch;
let deniedExternalCalls = 0, snapshotReads = 0;
const allowedOrigin = process.env.PUBLIC_SNAPSHOT_BASE_URL ? new URL(process.env.PUBLIC_SNAPSHOT_BASE_URL).origin : null;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (allowedOrigin && url.origin === allowedOrigin && ["GET","HEAD"].includes(init?.method ?? "GET")) { snapshotReads++; return originalFetch(input,init); }
  deniedExternalCalls++;
  throw new Error("Release verification blocked a non-snapshot external operation");
};
const { default: next } = await import("next");
const app = next({ dev:false,dir:process.cwd() });
await app.prepare();
// Reassert absence after any Next dotenv initialization, before accepting requests.
Object.assign(process.env, publicBuildEnvironment());
for (const key of ["OPENAI_API_KEY","SUPADATA_API_KEY","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY","BLOB_READ_WRITE_TOKEN"]) if(process.env[key])throw new Error("Paid/write credential remained in public test runtime");
const server = createServer(app.getRequestHandler());
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const port = server.address().port;
const results = []; const surfaces=[];
const pointer=JSON.parse(await readFile("data/public-snapshots/current.json","utf8"));
const corpus=JSON.parse(await readFile(`data/public-snapshots/${pointer.id}.json`,"utf8"));
async function check(path,method,expected,payload) {
  const response = await new Promise((resolve,reject) => {
    const req = request({ hostname:"127.0.0.1",port,path,method,agent:false,headers:{"Content-Type":"application/json"} },res => {
      let body="";res.on("data",chunk=>body+=chunk);res.on("end",()=>resolve({status:res.statusCode,body,cdnCache:res.headers["vercel-cdn-cache-control"],vary:res.headers.vary}));
    });req.on("error",reject);req.end(payload ? JSON.stringify(payload) : ["POST","PUT","PATCH"].includes(method)?"invalid JSON":undefined);
  });
  assertPublicText(response.body,sensitiveValues); surfaces.push({path,method,body:response.body});
  if(response.status!==expected)throw new Error(`${method} ${path} returned ${response.status}; expected ${expected}`);
  if(expected===200 && !response.cdnCache?.includes("s-maxage=60"))throw new Error(`Public read is missing CDN cache policy: ${path}`);
  if(expected===200 && Buffer.byteLength(response.body)>2*1024*1024)throw new Error(`Public response exceeds audit size budget: ${path}`);
  if(expected===403 && method!=="HEAD" && !response.body.includes("PUBLIC_READ_ONLY"))throw new Error("Missing public denial code");
  if(path==="/" && method==="GET") {
    if(!response.body.includes("read-only showcase mode"))throw new Error("Public edition marker missing");
    if(/<nav[^>]*>[\s\S]*?(?:action|href)="\/api\/(?:processing|research-query|fpl-|sources|prompt-settings)/.test(response.body))throw new Error("Mutating navigation detected");
    if(response.body.includes("Published research is unavailable"))throw new Error("Snapshot is unavailable in production output");
  }
  results.push({method,path,status:response.status,bytes:Buffer.byteLength(response.body),cdnCache:response.cdnCache,vary:response.vary});
}
try {
  for(const path of ["/","/intelligence","/intelligence/briefings","/players","/fixtures","/ask","/sources","/settings","/api/entities/search?q=Saka"])await check(path,"GET",200);
  await check("/api/entities/search?q=Saka","HEAD",200);
  for(const type of ["PLAYER","TEAM"]) {
    const entity=corpus.tables.entities.find(row=>row.type===type);
    if(entity)await check(`/entities/${entity.id}?range=all`,"GET",200);
  }
  if(corpus.tables.episodes[0])await check(`/episodes/${corpus.tables.episodes[0].id}`,"GET",200);
  if(corpus.tables.run_summaries[0])await check(`/intelligence/briefings/${corpus.tables.run_summaries[0].id}`,"GET",200);
  const savedBriefing=corpus.tables.run_summaries.find(row=>row.scope_type==="DATE_RANGE");
  if(savedBriefing)await check(`/api/syntheses?from=${savedBriefing.from_date}&to=${savedBriefing.to_date}&id=${savedBriefing.id}`,"GET",200);
  await check("/squad","GET",process.env.PUBLIC_SHOW_SQUAD==="true"?200:403);
  for(const path of ["/?pageSize=1000000","/api/entities/search?q="+"x".repeat(101),"/intelligence?page=1001","/api/entities/search?select=*","/players?q=x&q=y"])await check(path,"GET",400);
  for(const [path,methods] of [
    ["/api/processing-runs",["GET","POST"]],["/api/processing-runs/url-batch",["POST"]],["/api/processing-runs/cancel",["POST"]],
    ["/api/episodes/00000000-0000-4000-8000-000000000001/processing",["POST"]],
    ["/api/sources",["POST","PATCH"]],["/api/syntheses",["POST"]],["/api/research-query",["POST"]],
    ["/api/fpl-sync",["POST"]],["/api/fpl-squad",["POST"]],["/api/prompt-settings",["PUT","DELETE"]],
    ["/.env.local",["GET"]],["/.git/config",["GET"]],[`/data/public-snapshots/${pointer.id}.json`,["GET"]],["/_next/server/app-paths-manifest.json",["GET"]],["/api/syntheses",["OPTIONS"]],["/api/health",["GET"]],["/api/research-health",["GET"]],["/api/unreviewed",["GET","POST"]],
    ["/_next/image?url=%2Ffavicon.ico&w=3840&q=100",["GET"]],["/analyses",["GET"]],["/",["POST"]]
  ])for(const method of methods)await check(path,method,403);
  for(const action of ["RETRY","RESUME","PAUSE","CANCEL","DISMISS"])await check(`/api/episodes/${corpus.tables.episodes[0].id}/processing`,"POST",403,{action});
  await check("/api/processing-runs","POST",403,{selectedSourceIds:[],fromDate:"2026-11-01",toDate:"2026-11-02"});
  await check("/api/syntheses","POST",403,{scope:"LATEST_RUN"});
  await check("/api/prompt-settings","PUT",403,{extractionInstructions:"PUBLIC AUDIT MUST NOT SAVE",synthesisInstructions:"PUBLIC AUDIT MUST NOT SAVE"});
  if(deniedExternalCalls)throw new Error("A route attempted a prohibited external operation");
  const report={appMode:process.env.APP_MODE,paidAndWriteSecrets:"blanked before Next environment loading",snapshotSource:allowedOrigin?"public object storage":"local files",snapshotReads,deniedExternalCalls,results};
  await writeFile(".security-http-surfaces.json",JSON.stringify(surfaces));
  await writeFile("docs/public-deployment-checks.json",JSON.stringify(report,null,2)+"\n");
  console.log(`${results.length} production HTTP checks passed; zero prohibited external operations`);
} finally { await new Promise(resolve=>server.close(resolve));await app.close();globalThis.fetch=originalFetch; }
