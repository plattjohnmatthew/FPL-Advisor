import { publicSnapshotFiles } from "../../lib/public-snapshot/transport";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRemoteSnapshotReader, snapshotDigest, snapshotBaseUrl } from "../../lib/public-snapshot/remote";
import { publishRemoteSnapshot, activateRemoteSnapshot, type PutSnapshotObject } from "../../lib/public-snapshot/release";
import { sanitizeTables, type PublicSnapshot } from "../../lib/public-snapshot/schema";
import { getAppCapabilities } from "../../lib/app-config";
import { checkPublicBundle } from "../../scripts/check-public-bundle";
function fixture(id="version-one"): PublicSnapshot {
 const tables=sanitizeTables({});
 return {schema_version:1,id,generated_at:"2026-11-02T12:00:00Z",latest_source_publication_at:null,latest_briefing_at:null,counts:Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length])),tables};
}
const base="https://teststore.public.blob.vercel-storage.com/fpl-research/";
function pointer(snapshot:PublicSnapshot) {return {schema_version:1 as const,id:snapshot.id,sha256:snapshotDigest(publicSnapshotFiles(snapshot).serialized)};}
test("public object reader pins valid versions, deduplicates downloads and follows data releases without code changes",async()=>{
 let now=0,calls=0;let current=fixture();
 const fetcher:typeof fetch=async(input,init)=>{
  calls++;assert.equal(init?.method,undefined);assert.equal(init?.headers,undefined);assert.equal(init?.redirect,"error");
  return String(input).endsWith("current.json") ? Response.json(pointer(current)) : Response.json(publicSnapshotFiles(current).manifest);
 };
 const read=createRemoteSnapshotReader(fetcher,()=>now);
 const [first,parallel]=await Promise.all([read(base),read(base)]);
 assert.equal(first.id,"version-one");assert.equal(first,parallel);assert.equal(calls,2);
 current=fixture("version-two");assert.equal((await read(base)).id,"version-one");
 now=60001;assert.equal((await read(base)).id,"version-two");assert.equal(calls,4);
});
test("invalid or tampered remote data never enters the public read cache",async()=>{
 let calls=0;
 const read=createRemoteSnapshotReader(async()=>{calls++;return calls===1 ? Response.json({...pointer(fixture()),id:"../private"}) : Response.json(fixture());});
 await assert.rejects(read(base),/pointer/);assert.equal(calls,1);
 const tampered=createRemoteSnapshotReader(async(input)=>String(input).endsWith("current.json") ? Response.json(pointer(fixture())) : Response.json(publicSnapshotFiles(fixture("tampered")).manifest));
 await assert.rejects(tampered(base),/integrity/);
 for(const url of ["http://example.com/","https://private.blob.vercel-storage.com/","https://store.public.blob.vercel-storage.com/?token=secret"])assert.throws(()=>snapshotBaseUrl(url));
});
test("data publisher uploads immutable content before pointer, preserves active version on failures and supports pointer-only rollback",async()=>{
 const saved={...process.env};
 process.env.APP_MODE="private";delete process.env.VERCEL;
 process.env.BLOB_READ_WRITE_TOKEN="vercel_blob_rw_" + "teststore_fake-local-test-token";process.env.PUBLIC_SNAPSHOT_BASE_URL=base;
 const objects=new Map<string,string>(); const paths:string[]=[];
 const put:PutSnapshotObject=async(path,body,options)=>{paths.push(path);assert.equal(options.access,"public");if(path.endsWith("current.json"))assert.equal(options.allowOverwrite,true);else assert.equal(options.allowOverwrite,false);objects.set(path,body);return {url:new URL(path,new URL(base).origin).href};};
 try {
  const initial=fixture();await publishRemoteSnapshot(initial,put);
  assert.deepEqual(paths,["fpl-research/version-one.json","fpl-research/current.json"]);
  const active=objects.get("fpl-research/current.json");
  await assert.rejects(publishRemoteSnapshot(fixture("failed"),async()=>{throw new Error("Upload failed");}),/Upload failed/);
  assert.equal(objects.get("fpl-research/current.json"),active);
  await assert.rejects(publishRemoteSnapshot(fixture("pointer-failed"),async(path,body,options)=>{if(path.endsWith("current.json"))throw new Error("Pointer failed");return put(path,body,options);}),/Pointer failed/);
  assert.equal(objects.get("fpl-research/current.json"),active);
  await publishRemoteSnapshot(fixture("version-two"),put);
  paths.length=0;await activateRemoteSnapshot(pointer(initial),put);assert.deepEqual(paths,["fpl-research/current.json"]);
  assert.equal(objects.get("fpl-research/current.json"),active);
  process.env.BLOB_READ_WRITE_TOKEN="vercel_blob_rw_" + "wrongstore_fake-local-test-token";
  await assert.rejects(publishRemoteSnapshot(initial,()=>assert.fail("Wrong store must fail before uploading")),/store/);
  process.env.APP_MODE="public_read_only";
  await assert.rejects(publishRemoteSnapshot(initial,()=>assert.fail("Public cannot upload")),/disabled/);
 } finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test("public build environment strips paid, write and accidentally public secret variables",()=>{
 const code=`import {publicBuildEnvironment} from './scripts/public-environment.mjs';console.log(JSON.stringify(publicBuildEnvironment({APP_MODE:'private',OPENAI_API_KEY:'private-openai',SUPADATA_API_KEY:'private-transcript',SUPABASE_SECRET_KEY:'private-db',BLOB_READ_WRITE_TOKEN:'private-storage',NEXT_PUBLIC_OPENAI_API_KEY:'accidental-leak',PUBLIC_SNAPSHOT_BASE_URL:'${base}',NEXT_PUBLIC_GITHUB_REPO_URL:'https://github.com/example/repo'})));`;
 const env=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8"}));
 assert.equal(env.APP_MODE,"public_read_only");
 for(const key of ["OPENAI_API_KEY","SUPADATA_API_KEY","SUPABASE_SECRET_KEY","BLOB_READ_WRITE_TOKEN","NEXT_PUBLIC_OPENAI_API_KEY"])assert.equal(env[key],"");
 assert.equal(env.PUBLIC_SNAPSHOT_BASE_URL,base);assert.equal(env.NEXT_PUBLIC_GITHUB_REPO_URL,"https://github.com/example/repo");
});
test("Vercel refuses accidental private runtime and browser artifact scanner catches credentials",async()=>{
 const saved={mode:process.env.APP_MODE,vercel:process.env.VERCEL};
 const directory=await mkdtemp(join(tmpdir(),"fpl-bundle-"));
 try {
  process.env.VERCEL="1";process.env.APP_MODE="private";assert.throws(getAppCapabilities,/Vercel/);
  process.env.APP_MODE="public_read_only";assert.equal(getAppCapabilities().canWriteData,false);
  await writeFile(join(directory,"page.js"),"console.log('safe public UI');");assert.equal(await checkPublicBundle(directory),1);
  await writeFile(join(directory,"page.js"),"const key='sb_secret_"+"x".repeat(30)+"';");await assert.rejects(checkPublicBundle(directory),/Credential/);
 } finally {if(saved.mode===undefined)delete process.env.APP_MODE;else process.env.APP_MODE=saved.mode;if(saved.vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=saved.vercel;await rm(directory,{recursive:true,force:true});}
});
