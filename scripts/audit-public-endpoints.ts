import { readdir,readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { publicRequestAllowed } from "../lib/app-config";
async function files(dir:string):Promise<string[]>{return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(row=>row.isDirectory()?files(join(dir,row.name)):[join(dir,row.name)]))).flat();}
async function main(){
 process.env.APP_MODE="public_read_only";
 const sourceFiles=[...await files("app"),...await files("lib")].filter(file=>/\.(ts|tsx)$/.test(file));
 const endpoints:Array<{path:string;method:string;classification:string;privateMode:string}>=[];const serverActions:string[]=[];
 for(const file of sourceFiles){
  const source=await readFile(file,"utf8");if(/^["']use server["'];?/m.test(source))serverActions.push(file);
  if(!/[/\\](route\.ts|page\.tsx)$/.test(file))continue;
  const path="/"+file.replaceAll("\\","/").replace(/^app\//,"").replace(/\/?(?:route\.ts|page\.tsx)$/,"");
  const methods=file.endsWith("route.ts")?[...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(/g)].map(match=>match[1]):["GET"];
  if(methods.includes("GET")&&!methods.includes("HEAD"))methods.push("HEAD");
  const probe=path.replace(/\[[^/]+\]/g,"00000000-0000-4000-8000-000000000001");
  for(const method of methods){
   const allowed=publicRequestAllowed(probe,method);
   endpoints.push({path,method,classification:path==="/squad"?"PUBLIC READ ONLY IF ENABLED":allowed?"PUBLIC READ":path==="/analyses"?"PRIVATE":"DISABLED IN PUBLIC",privateMode:"existing behavior"});
  }
 }
 if(serverActions.length)throw new Error("New server actions require an explicit public security review");
 await writeFile("docs/public-endpoint-audit.json",JSON.stringify({endpoints,serverActions,unknownEndpoints:"DISABLED IN PUBLIC by default",imageOptimizer:"DISABLED IN PUBLIC",privateTools:["publish:public","publish:public-data","rollback:public-data","local transcript import"],staticAssets:"Next immutable assets and local fonts; no provider execution"},null,2)+"\n");
 console.log(`Classified ${endpoints.length} route/method combinations; zero server actions.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
