import { publishRemoteSnapshot } from "../../lib/public-snapshot/release";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { validatePublicRequest, PUBLIC_CDN_CACHE } from "../../lib/public-request";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createPublicSnapshotResearchClient, querySnapshot } from "../../lib/public-snapshot/client";
import { OpenAIInsightExtractor } from "../../lib/insights/openai-extractor";
import { OpenAISplitDecisionDetector } from "../../lib/splits/openai-detector";
import { OpenAIResearchQueryInterpreter, OpenAIResearchAnswerGenerator } from "../../lib/research/openai";
import { OpenAIRunSummaryGenerator } from "../../lib/summaries/openai-generator";
import { trackOpenAICall } from "../../lib/openai/usage";
import { OPENAI_MODEL_TASKS } from "../../lib/openai/model-policy";
import { ManualTranscriptProvider } from "../../lib/transcripts/manual-provider";
import { AuditedTranscriptProvider } from "../../lib/transcripts/audited-provider";
import { TranscriptProviderChain } from "../../lib/transcripts/provider-chain";
import { SupadataTranscriptProvider } from "../../lib/transcripts/supadata-provider";
import { YouTubeLocalTranscriptProvider } from "../../lib/transcripts/youtube-local-provider";
import { OfficialFplDataProvider } from "../../lib/fpl/official-provider";
import { OfficialFplEntryProvider } from "../../lib/fpl-entry/official-provider";
import { YouTubeEpisodeDiscoveryProvider } from "../../lib/processing/youtube-discovery";
import { YouTubeChannelResolver } from "../../lib/sources/youtube-channel-resolver";
import { SupabasePromptSettingsRepository } from "../../lib/prompt-settings/repository";
import { sanitizeTables, type PublicSnapshot } from "../../lib/public-snapshot/schema";
import { publicSnapshotFiles, boundedText } from "../../lib/public-snapshot/transport";
import { createRemoteSnapshotReader, snapshotDigest } from "../../lib/public-snapshot/remote";
import { assertPublicText } from "../../scripts/public-secrets.mjs";

test("every real provider boundary and all OpenAI task wrappers reject public execution before any injected transport or recorder",async()=>{
 const saved={...process.env},fetcher=globalThis.fetch;let operations=0;
 process.env.APP_MODE="public_read_only";process.env.PUBLIC_SHOW_SQUAD="true";delete process.env.PUBLIC_SNAPSHOT_BASE_URL;
 const forbidden=async()=>{operations++;throw new Error("A forbidden provider was reached");};globalThis.fetch=forbidden;
 const recorder={recordTranscriptProviderCall:forbidden};const transcript={acquireTranscript:forbidden};
 const generator=new OpenAIRunSummaryGenerator();
 const attempts=[
  ()=>new OpenAIInsightExtractor().extract(undefined as never,undefined as never),
  ()=>new OpenAISplitDecisionDetector().detect([]),
  ()=>new OpenAIResearchQueryInterpreter().interpret("Captaincy?"),
  ()=>new OpenAIResearchAnswerGenerator().answer("Captaincy?",[],[]),
  ()=>new OpenAIResearchAnswerGenerator().answer("Captaincy?",[],[],{error:"repair",validEvidenceIds:[]}),
  ()=>generator.generate(undefined as never),()=>generator.getIdentity(),
  ()=>new SupadataTranscriptProvider("unused",{fetcher:forbidden}).acquireTranscript(undefined as never),
  ()=>new YouTubeLocalTranscriptProvider({execute:forbidden}).acquireTranscript(undefined as never),
  ()=>new ManualTranscriptProvider(forbidden).acquireTranscript(undefined as never),
  ()=>new AuditedTranscriptProvider("test",transcript,recorder).acquireTranscript(undefined as never),
  ()=>new TranscriptProviderChain("test",transcript,null,null,recorder).acquireTranscript(undefined as never),
  ()=>new OfficialFplDataProvider(forbidden).fetchSnapshot(),
  ()=>new OfficialFplEntryProvider(forbidden).fetchLatestPublicSquad(1),
  ()=>new YouTubeEpisodeDiscoveryProvider(forbidden).discoverEpisodes(undefined as never,null),
  ()=>new YouTubeChannelResolver(forbidden).resolve("https://youtube.com/@test"),
 ];
 try {
  for(const attempt of attempts)await assert.rejects(attempt(),/PUBLIC_READ_ONLY/);
  for(const task of [...OPENAI_MODEL_TASKS,"STRUCTURED_OUTPUT_REPAIR"] as const)await assert.rejects(trackOpenAICall({task,model:"unused"},forbidden),/PUBLIC_READ_ONLY/);
  assert.equal(operations,0);
 }finally{globalThis.fetch=fetcher;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test("operational inserts/updates/deletes, settings writes and snapshot writes/RPCs fail without reaching fetch",async()=>{
 const saved={...process.env},fetcher=globalThis.fetch;let calls=0;
 process.env.APP_MODE="public_read_only";process.env.PUBLIC_SHOW_SQUAD="true";delete process.env.PUBLIC_SNAPSHOT_BASE_URL;
 globalThis.fetch=async()=>{calls++;throw new Error("Network forbidden");};
 try {
  for(const method of ["insert","update","delete"] as const)await assert.rejects(async()=>{const table=createSupabaseServerClient().from("insights");if(method==="delete")await table.delete();else await table[method]({claim:"blocked"});},/PUBLIC_READ_ONLY/);
  await assert.rejects(new SupabasePromptSettingsRepository().save("blocked","blocked"),/PUBLIC_READ_ONLY/);
  const db=createPublicSnapshotResearchClient();
  for(const operation of [()=>db.from("insights").insert({claim:"blocked"}),()=>db.from("insights").update({claim:"blocked"}).eq("id","missing"),()=>db.from("insights").delete().eq("id","missing"),()=>db.rpc("persist_scoped_synthesis",{}),()=>db.rpc("persist_scoped_synthesis",{},{get:true})]){
   const result=await operation();assert.ok(result.error);assert.match(result.error.message,/PUBLIC_READ_ONLY/);
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=fetcher;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test("public request bounds reject bulk, cache-busting, duplicate and oversized inputs; image optimizer stays disabled",()=>{
 const saved=process.env.APP_MODE;process.env.APP_MODE="public_read_only";
 try {
  for(const path of ["/?limit=999999","/api/entities/search?select=*","/api/entities/search?q="+"x".repeat(101),"/intelligence?page=1001","/players?q=x&q=y","/entities/not-a-uuid"]){assert.ok(validatePublicRequest(new URL(path,"https://local.test")),path);}
  assert.equal(proxy(new NextRequest("https://local.test/_next/image?url=/favicon.ico&w=3840&q=100")).status,403);
  const response=proxy(new NextRequest("https://local.test/intelligence?page=2"));assert.equal(response.headers.get("Vercel-CDN-Cache-Control"),PUBLIC_CDN_CACHE);
  assert.equal(proxy(new NextRequest("https://local.test/ask?q=Private%20question")).headers.get("Vercel-CDN-Cache-Control"),null);
  process.env.APP_MODE="private";assert.equal(validatePublicRequest(new URL("https://local.test/?limit=999999")),null);
 }finally{if(saved===undefined)delete process.env.APP_MODE;else process.env.APP_MODE=saved;}
});
test("public transport shards insights to at most 100 rows, reassembles integrity-checked data and refuses monolithic legacy objects",async()=>{
 const tables=sanitizeTables({sources:[{id:"creator",name:"Creator"}],episodes:[{id:"episode",source_id:"creator",source_url:"https://example.com/episode"}],insights:Array.from({length:201},(_,index)=>({id:`claim-${index}`,episode_id:"episode",claim:"Realistic test claim"}))});
 const snapshot:PublicSnapshot={schema_version:1,id:"chunk-test",generated_at:"2026-11-02T12:00:00Z",latest_briefing_at:null,latest_source_publication_at:null,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),tables};
 const transport=publicSnapshotFiles(snapshot);assert.equal(transport.manifest.tables.insights.length,0);assert.deepEqual(transport.chunks.map(chunk=>chunk.count),[100,100,1]);
 const base="https://teststore.public.blob.vercel-storage.com/fpl-research/";
 const reader=createRemoteSnapshotReader(async(input)=>{
  const filename=new URL(String(input)).pathname.split("/").at(-1)!;
  if(filename==="current.json")return Response.json({schema_version:1,id:snapshot.id,sha256:snapshotDigest(transport.serialized)});
  if(filename===`${snapshot.id}.json`)return new Response(transport.serialized);
  const chunk=transport.chunks.find(row=>row.filename===filename);assert.ok(chunk);return new Response(chunk.serialized);
 });
 assert.equal((await reader(base)).tables.insights.length,201);
 const saved={...process.env};let uploads=0;const uploaded:string[]=[];
 process.env.APP_MODE="private";delete process.env.VERCEL;process.env.PUBLIC_SNAPSHOT_BASE_URL=base;process.env.BLOB_READ_WRITE_TOKEN="vercel_blob_rw_" + "teststore_fake-local-token";
 try {
  await assert.rejects(publishRemoteSnapshot(snapshot,async(path)=>{uploads++;if(uploads===2)throw new Error("chunk upload failed");uploaded.push(path);return{url:new URL(path,new URL(base).origin).href};}),/chunk upload failed/);
  assert.equal(uploaded.length,1);assert.ok(uploaded[0].endsWith("-insights-0.json"));assert.ok(!uploaded.some(path=>path.endsWith("current.json")));
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
 const old=createRemoteSnapshotReader(async(input)=>String(input).endsWith("current.json")?Response.json({schema_version:1,id:snapshot.id,sha256:snapshotDigest(JSON.stringify(snapshot))}):Response.json(snapshot));
 await assert.rejects(old(base),/chunked/);
 await assert.rejects(boundedText(new Response("x".repeat(101)),100),/size limit/);
});
test("public text scanner rejects keys, encoded custom instructions and configuration; wildcard matching treats escaped input literally",()=>{
 const secret="Owner private prompt instruction: never expose this text.";
 for(const text of [secret,JSON.stringify(secret),"OPENAI_API_KEY", "sb_secret_"+"x".repeat(30)])assert.throws(()=>assertPublicText(text,[secret]));
 assert.doesNotThrow(()=>assertPublicText("Published creator evidence"));
 const tables=sanitizeTables({episodes:[{id:"one",title:"100% real"},{id:"two",title:"1000 real"}]});
 assert.equal(querySnapshot(tables,"episodes",new URLSearchParams({select:"id",title:"ilike.%100\\%%"})).count,1);
});

test("snapshot outages have a retry cooldown rather than amplifying requests",async()=>{
 let calls=0,time=0;
 const read=createRemoteSnapshotReader(async()=>{calls++;throw new Error("temporary storage failure");},()=>time);
 const base="https://teststore.public.blob.vercel-storage.com/fpl-research/";
 await assert.rejects(read(base),/storage failure/);await assert.rejects(read(base),/temporarily unavailable/);assert.equal(calls,1);
 time=60001;await assert.rejects(read(base),/storage failure/);assert.equal(calls,2);
});
