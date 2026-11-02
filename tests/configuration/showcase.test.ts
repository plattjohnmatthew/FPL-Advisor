import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runShowcaseAction, getShowcaseLinks } from "../../lib/showcase";
import { getAppCapabilities, publicRequestAllowed } from "../../lib/app-config";
import { sanitizeTables, validateSnapshot, PublishedSquadSchema, type PublicSnapshot } from "../../lib/public-snapshot/schema";
test("one gate opens public explanation with zero action executions; private handler executes once",()=>{
 let executed=0; const shown:string[]=[];
 for(const action of ["Generate briefing","Regenerate briefing","Ask AI","Process URLs","Process creators","Add creator","Retry processing","Refresh My Squad","Change FPL entry","Refresh FPL data"]){
  assert.equal(runShowcaseAction(true,action=>shown.push(action),action,()=>{executed++;}),false);
 }
 assert.equal(executed,0); assert.equal(shown.length,10);
 assert.equal(runShowcaseAction(false,()=>assert.fail("Private action was blocked"),"Ask AI",()=>{executed++;}),true);
 assert.equal(executed,1);
});
test("live handlers gate before busy/loading state or network and share accessible dialog",()=>{
 const ask=readFileSync("app/ask/workspace.tsx","utf8");
 assert.ok(ask.indexOf('showcase.block("Ask AI")')<ask.indexOf('busy.current = true'));
 const briefing=readFileSync("app/intelligence/briefing-workspace.tsx","utf8");
 assert.ok(briefing.indexOf('showcase.block(')<briefing.indexOf('await fetch("/api/syntheses"'));
 const squad=readFileSync("app/squad/squad-view.tsx","utf8");
 assert.ok(squad.indexOf('showcase.block("Refresh My Squad")')<squad.indexOf('setBusy(true)'));
 const gate=readFileSync("components/showcase-action-gate.tsx","utf8");
 assert.match(gate,/<Dialog/); assert.match(gate,/Read-only showcase/);assert.doesNotMatch(gate,/fetch\(|alert\(/);
 const dialog=readFileSync("components/ui/interactive.tsx","utf8");
 assert.match(dialog,/previous\?\.focus/); assert.match(dialog,/onCancel/);assert.match(dialog,/aria-labelledby/);
});
test("My Squad requires explicit display opt-in and optional snapshot has no private escape hatch",()=>{
 const previous=process.env.APP_MODE, flag=process.env.PUBLIC_SHOW_SQUAD;
 try {
  process.env.APP_MODE="public_read_only";delete process.env.PUBLIC_SHOW_SQUAD;
  assert.equal(getAppCapabilities().canViewSquad,false); assert.equal(publicRequestAllowed("/squad","GET"),false);
  process.env.PUBLIC_SHOW_SQUAD="true";
  assert.equal(getAppCapabilities().canViewSquad,true); assert.equal(publicRequestAllowed("/squad","GET"),true);
  assert.equal(publicRequestAllowed("/api/fpl-squad","POST"),false);
  const tables=sanitizeTables({});
  const snapshot:PublicSnapshot={id:"empty",schema_version:1,generated_at:new Date().toISOString(),latest_source_publication_at:null,latest_briefing_at:null,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),tables};
  validateSnapshot(snapshot);assert.equal(snapshot.squad,undefined);
 } finally { if(previous===undefined)delete process.env.APP_MODE;else process.env.APP_MODE=previous;if(flag===undefined)delete process.env.PUBLIC_SHOW_SQUAD;else process.env.PUBLIC_SHOW_SQUAD=flag; }
});
test("GitHub and setup use one validated canonical destination",()=>{
 const previous=process.env.NEXT_PUBLIC_GITHUB_REPO_URL;
 try {
  process.env.NEXT_PUBLIC_GITHUB_REPO_URL="https://github.com/example/fpl";
  assert.deepEqual(getShowcaseLinks(),{github:"https://github.com/example/fpl",setup:"https://github.com/example/fpl#local-setup"});
  process.env.NEXT_PUBLIC_GITHUB_REPO_URL="javascript:alert(1)";assert.throws(getShowcaseLinks,/HTTPS GitHub/);
 } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_GITHUB_REPO_URL;else process.env.NEXT_PUBLIC_GITHUB_REPO_URL=previous;}
});

test("optional squad contract rejects manager identity, refresh errors and internal extras",()=>{
 const picks=Array.from({length:15},(_,index)=>({fplPlayerId:index+1,squadPosition:index+1,multiplier:index<11?1:0,isCaptain:index===0,isViceCaptain:index===1,benchOrder:index<11?null:index-10}));
 const squad={entryId:1,entryName:"Explicitly published team",gameweek:10,retrievedAt:"2026-11-02T12:00:00Z",eventPoints:null,totalPoints:null,overallRank:null,activeChip:null,picks};
 assert.equal(PublishedSquadSchema.safeParse(squad).success,true);
 assert.equal(PublishedSquadSchema.safeParse({...squad,managerName:"private identity"}).success,false);
 assert.equal(PublishedSquadSchema.safeParse({...squad,refreshError:"internal error"}).success,false);
});
