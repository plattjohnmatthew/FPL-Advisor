import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeTables, validateSnapshot, type PublicSnapshot } from "../../lib/public-snapshot/schema";
import { writeSnapshot, readSnapshot } from "../../lib/public-snapshot/storage";
import { REPORT_SECTION_KEYS } from "../../lib/summaries/schema";
import { querySnapshot } from "../../lib/public-snapshot/client";
function fixture():PublicSnapshot {
  const tables=sanitizeTables({
    sources:[{id:"creator",name:"Creator",platform:"YOUTUBE",api_key:"private-key"}],
    episodes:[{id:"episode",source_id:"creator",title:"Captaincy",source_url:"https://youtube.com/watch?v=123",published_at:"2026-11-02",error_message:"private error"}],
    transcripts:[{id:"transcript",episode_id:"episode",content:"full private transcript"}],
    insights:[{id:"insight",episode_id:"episode",claim:"A creator claim",evidence_text:"evidence",primary_category:"CAPTAINCY"}],
    entities:[{id:"player",type:"PLAYER",canonical_name:"Player",aliases:[]}],
    insight_entities:[{insight_id:"insight",entity_id:"player",role:"SUBJECT"}]
  });
  return {schema_version:1,id:"test-version",generated_at:"2026-11-02T12:00:00Z",latest_source_publication_at:"2026-11-02",latest_briefing_at:null,counts:Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length])),tables};
}
test("publisher uses field allowlists, omits transcripts, private errors and configuration",()=>{
  const snapshot=fixture(); validateSnapshot(snapshot);
  const json=JSON.stringify(snapshot);
  assert.doesNotMatch(json,/private-key|private error|full private transcript|api_key|error_message/);
  const broken=structuredClone(snapshot); broken.tables.insights[0].episode_id="unpublished";
  assert.throws(()=>validateSnapshot(broken),/relationship/);
  const injected=structuredClone(snapshot); injected.tables.sources[0].secret="hidden";
  assert.throws(()=>validateSnapshot(injected),/Unapproved/);
  snapshot.tables.insights[0].claim="sk-proj-"+"x".repeat(30);
  assert.throws(()=>validateSnapshot(snapshot),/credential/);
});
test("snapshot queries preserve nested evidence, inner filters, counts, pagination and ordering",()=>{
  const tables=fixture().tables;
  const result=querySnapshot(tables,"episodes",new URLSearchParams({select:"id,title,sources!inner(name),insights!inner(id,claim,primary_category)","insights.primary_category":"eq.CAPTAINCY",order:"published_at.desc",limit:"1"}));
  assert.equal(result.count,1); assert.deepEqual(result.data[0]?.sources,{name:"Creator"});
  assert.equal((result.data[0]?.insights as Array<{id:string}>)[0].id,"insight");
  const empty=querySnapshot(tables,"episodes",new URLSearchParams({select:"id,insights!inner(id)","insights.primary_category":"eq.FIXTURES"}));
  assert.equal(empty.count,0);
  assert.equal(querySnapshot(tables,"episodes",new URLSearchParams({select:"id",title:"ilike.%captain%",offset:"1"})).data.length,0);
  assert.throws(()=>querySnapshot(tables,"ai_instruction_settings",new URLSearchParams()),/Unpublished/);
});
test("atomic publication retains previous version when validation fails and keeps immutable history",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"fpl-public-test-"));
  try {
    const first=fixture(); await writeSnapshot(first,directory);
    const originalPointer=await readFile(join(directory,"current.json"),"utf8");
    const bad=fixture(); bad.id="bad"; bad.tables.insights[0].episode_id="missing";
    await assert.rejects(writeSnapshot(bad,directory),/relationship/);
    assert.equal(await readFile(join(directory,"current.json"),"utf8"),originalPointer);
    const next=fixture(); next.id="second-version"; await writeSnapshot(next,directory);
    assert.equal((await readSnapshot(directory)).id,"second-version");
    assert.ok(await readFile(join(directory,"test-version.json"),"utf8"));
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("briefing export strips hidden instructions and cache configuration while retaining canonical findings",()=>{
 const original=fixture();const id="00000000-0000-4000-8000-000000000001";
 original.tables.insights[0].id=id;original.tables.insight_entities[0].insight_id=id;
 const tables=sanitizeTables({...original.tables,run_summaries:[{id:"report",summary_data:{title:"Published briefing",overviewParagraphs:["First real finding.","Second real finding."],overviewSupportingInsightIds:[id],sections:Object.fromEntries(REPORT_SECTION_KEYS.map(key=>[key,[]])),splitDecisionIds:[],_synthesis:{secretPrompt:"hidden instructions",modelConfiguration:"private"}}}]});
 assert.doesNotMatch(JSON.stringify(tables),/hidden instructions|secretPrompt|modelConfiguration|_synthesis/);
 assert.equal((tables.run_summaries[0].summary_data as {title:string}).title,"Published briefing");
});
