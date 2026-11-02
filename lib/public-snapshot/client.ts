import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readSnapshot } from "./storage";
import type { PublicRow, PublicTables } from "./schema";

const edges: Array<[string,string,string,string]> = [
  ["episodes","source_id","sources","id"], ["transcripts","episode_id","episodes","id"], ["episode_extractions","episode_id","episodes","id"],
  ["insights","episode_id","episodes","id"], ["insight_entities","insight_id","insights","id"], ["insight_entities","entity_id","entities","id"],
  ["split_positions","split_decision_id","split_decisions","id"], ["split_position_insights","split_position_id","split_positions","id"], ["split_position_insights","insight_id","insights","id"],
  ["synthesis_episodes","synthesis_id","run_summaries","id"], ["synthesis_episodes","episode_id","episodes","id"], ["synthesis_attempts","synthesis_id","run_summaries","id"],
  ["fpl_players","fpl_team_id","fpl_teams","fpl_team_id"]
];
function parts(value: string) {
  let depth = 0, start = 0; const result: string[] = [];
  for (let i=0; i<value.length; i++) { if (value[i] === "(") depth++; if (value[i] === ")") depth--; if (value[i] === "," && depth === 0) { result.push(value.slice(start,i)); start=i+1; } }
  result.push(value.slice(start)); return result.filter(Boolean);
}
function predicate(value: unknown, expression: string): boolean {
  if (expression.startsWith("not.")) return !predicate(value,expression.slice(4));
  const dot=expression.indexOf("."), op=expression.slice(0,dot), raw=expression.slice(dot+1);
  const target: unknown = raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : raw;
  if (op === "eq" || op === "is") return value == null ? target === null : String(value) === String(target);
  if (op === "in") return parts(raw.slice(1,-1)).map(v=>v.replace(/^"|"$/g,"")).includes(String(value));
  if (op === "ilike") {
    // Greedy bounded glob matching, never a user-controlled backtracking RegExp.
    const tokens: Array<{ value: string; wildcard: boolean }> = [];
    for (let i=0;i<raw.length;i++) { if (raw[i] === "\\" && i+1<raw.length) tokens.push({value:raw[++i].toLowerCase(),wildcard:false}); else tokens.push({value:raw[i].toLowerCase(),wildcard:raw[i]==="%" || raw[i]==="_"}); }
    const text=String(value).toLowerCase();let input=0,token=0,star=-1,retry=0;
    while(input<text.length) {
      const current=tokens[token];
      if(current && ((current.wildcard && current.value==="_") || (!current.wildcard && current.value===text[input]))) {input++;token++;}
      else if(current?.wildcard && current.value==="%") {star=token++;retry=input;}
      else if(star>=0) {token=star+1;input=++retry;}
      else return false;
    }
    while(tokens[token]?.wildcard && tokens[token].value==="%")token++;
    return token===tokens.length;
  }
  if (op === "gte") return value != null && String(value)>=String(target);
  if (op === "lte") return value != null && String(value)<=String(target);
  if (op === "gt") return value != null && String(value)>String(target);
  if (op === "lt") return value != null && String(value)<String(target);
  throw new Error(`Unsupported snapshot filter: ${op}`);
}
function relation(tables: PublicTables, table: string, row: PublicRow, target: string) {
  const forward=edges.find(e=>e[0]===table && e[2]===target);
  if (forward) return { many:false, rows:tables[target as keyof PublicTables].filter(other=>other[forward[3]]===row[forward[1]]) };
  const reverse=edges.find(e=>e[2]===table && e[0]===target);
  if (reverse) return { many:true, rows:tables[target as keyof PublicTables].filter(other=>other[reverse[1]]===row[reverse[3]]) };
  throw new Error(`Unsupported snapshot relationship: ${table}.${target}`);
}
const queryCaches = new WeakMap<PublicTables, Map<string, { data: (PublicRow | null)[]; count: number }>>();
export function querySnapshot(tables: PublicTables, table: string, params: URLSearchParams) {
  const cacheKey = `${table}?${params}`;
  let cache = queryCaches.get(tables);
  if (!cache) { cache = new Map(); queryCaches.set(tables,cache); }
  const cached = cache.get(cacheKey); if (cached) return cached;
  if (!Object.hasOwn(tables,table)) throw new Error("Unpublished table");
  const filters=[...params.entries()].filter(([key])=>!["select","order","limit","offset"].includes(key));
  function project(name: string, row: PublicRow, select: string, prefix=""): PublicRow | null {
    for (const [key,exp] of filters) {
      if (!key.startsWith(prefix)) continue;
      const field=key.slice(prefix.length);
      if (field.includes(".")) continue;
      if (field === "or") {
        if (!parts(exp.slice(1,-1)).some(test=>{ const dot=test.indexOf("."); return predicate(row[test.slice(0,dot)],test.slice(dot+1)); })) return null;
      } else if (!predicate(row[field],exp)) return null;
    }
    const output: PublicRow={};
    for (const item of parts(select)) {
      const open=item.indexOf("(");
      if (open<0) { if (item === "*") Object.assign(output,row); else output[item]=row[item] ?? null; continue; }
      const descriptor=item.slice(0,open), target=descriptor.split("!")[0];
      const joined=relation(tables,name,row,target);
      const children=joined.rows.map(child=>project(target,child,item.slice(open+1,-1),`${prefix}${target}.`)).filter((child): child is PublicRow=>child!==null);
      if (descriptor.includes("!inner") && !children.length) return null;
      output[target]=joined.many ? children : children[0] ?? null;
    }
    return output;
  }
  let rows=tables[table as keyof PublicTables].map(row=>({ source:row, projected:project(table,row,params.get("select") ?? "*") })).filter(item=>item.projected!==null);
  for (const order of (params.get("order") ?? "").split(",").filter(Boolean).reverse()) {
    const [field,direction]=order.split("."); rows=rows.sort((a,b)=>{ const av=a.source[field],bv=b.source[field]; const cmp=av===bv ? 0 : av==null ? 1 : bv==null ? -1 : av<bv ? -1 : 1; return direction==="desc" ? -cmp : cmp; });
  }
  const count=rows.length, offset=Number(params.get("offset") ?? 0), limit=Number(params.get("limit") ?? count);
  const result = { data:rows.slice(offset,offset+limit).map(row=>row.projected), count };
  if (JSON.stringify(result).length <= 262144) { if (cache.size >= 32) cache.delete(cache.keys().next().value!); cache.set(cacheKey,result); }
  return result;
}
// Reuse the existing typed query builder locally. Its transport only reads files;
// the synthetic origin and key are never sent to any network service.
export function createPublicSnapshotResearchClient() {
  const snapshot=readSnapshot(); // one immutable version per client/query group
  return createClient("https://snapshot.invalid", "public-snapshot-local", { auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false }, global:{ fetch:async (input,init)=>{
    const method=init?.method ?? "GET", url=new URL(String(input));
    if (!["GET","HEAD"].includes(method) || url.pathname.includes("/rpc/")) throw new Error("PUBLIC_READ_ONLY: snapshot is immutable");
    const { data,count }=querySnapshot((await snapshot).tables,url.pathname.split("/").at(-1)!,url.searchParams);
    const headers=new Headers(init?.headers);
    if (headers.get("accept")?.includes("vnd.pgrst.object")) {
      if (data.length!==1) return Response.json({ code:"PGRST116",message:"No unique published record",details:`The result contains ${data.length} rows` },{ status:406 });
      return Response.json(data[0]);
    }
    return new Response(method==="HEAD" ? null : JSON.stringify(data),{ headers:{ "Content-Type":"application/json", "Content-Range":`0-${Math.max(0,data.length-1)}/${count}` } });
  } } });
}
