import { SupadataTranscriptProvider } from "../../lib/transcripts/supadata-provider";
import { YouTubeLocalTranscriptProvider } from "../../lib/transcripts/youtube-local-provider";
import type { StoredEpisode } from "../../lib/processing/types";
import { SupabaseOverviewRepository } from "../../lib/overview/repository";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, request as httpRequest } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getAppCapabilities, publicRequestAllowed } from "../../lib/app-config";
import { getOpenAIEnvironment, getTranscriptEnvironment, getSupabaseEnvironment } from "../../lib/env";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { trackOpenAICall } from "../../lib/openai/usage";

async function routes(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? routes(join(dir, entry.name)) : entry.name === "route.ts" ? [join(dir, entry.name)] : []))).flat();
}
test("public HTTP mutation handlers deny before parsing, paid calls, DB access or background work", async () => {
  const originalMode = process.env.APP_MODE; const originalFetch = globalThis.fetch;
  process.env.APP_MODE = "public_read_only";
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw new Error("External network forbidden"); };
  try {
    let checked = 0;
    for (const file of await routes(resolve("app/api"))) {
      const handlers = await import(pathToFileURL(file).href);
      const source = await readFile(file, "utf8");
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        if (!handlers[method]) continue;
        assert.match(source, /disabledResponse/);
        const server = createServer(async (req, res) => {
          try {
            const response: Response = await handlers[method](new Request("http://localhost/test", { method, body: "malformed JSON" }));
            res.writeHead(response.status, { "Content-Type": "application/json" }); res.end(await response.text());
          } catch (error) { res.writeHead(500); res.end(String(error)); }
        });
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        try {
          const address = server.address() as { port: number };
          const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
            const request = httpRequest({ hostname: "127.0.0.1", port: address.port, path: "/test", method, agent: false }, incoming => {
              let body = ""; incoming.on("data", chunk => { body += chunk; });
              incoming.on("end", () => resolve({ status: incoming.statusCode, body }));
            }); request.on("error", reject); request.end();
          });
          assert.equal(response.status, 403, `${file} ${method}`);
          assert.equal(JSON.parse(response.body).code, "PUBLIC_READ_ONLY");
          checked++;
        } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      }
    }
    assert.equal(checked, 12);
    let pythonCalls = 0;
    const local = new YouTubeLocalTranscriptProvider({ execute: async () => { pythonCalls++; return { stdout: "", stderr: "" }; } });
    const supadata = new SupadataTranscriptProvider("unused-key", { fetcher: async () => { externalCalls++; throw new Error("Forbidden"); } });
    await assert.rejects(local.acquireTranscript({} as StoredEpisode), /disabled/);
    await assert.rejects(supadata.acquireTranscript({} as StoredEpisode), /disabled/);
    assert.equal(pythonCalls, 0);
    assert.deepEqual(await new SupabaseOverviewRepository().squadEntityIds(), []);
    assert.equal(externalCalls, 0);
    assert.throws(() => getOpenAIEnvironment(), /disabled/);
    assert.throws(() => getTranscriptEnvironment(), /disabled/);
    await assert.rejects(trackOpenAICall({ task: "CHAT_ANSWER", model: "test" }, async () => { externalCalls++; return {}; }), /disabled/);
    assert.equal(externalCalls, 0);
  } finally { globalThis.fetch = originalFetch; if (originalMode === undefined) delete process.env.APP_MODE; else process.env.APP_MODE = originalMode; }
});
test("central public allowlist rejects operations and unknown routes; private preserves access", () => {
  const old = process.env.APP_MODE;
  try {
    process.env.APP_MODE = "public_read_only";
    for (const path of ["/", "/intelligence", "/intelligence/briefings", "/players", "/entities/player", "/episodes/episode", "/fixtures", "/api/syntheses", "/api/entities/search", "/ask", "/sources", "/settings"]) assert.equal(publicRequestAllowed(path, "GET"), true, path);
    for (const path of ["/squad", "/analyses", "/api/processing-runs", "/api/research-health", "/api/unknown"]) assert.equal(publicRequestAllowed(path, "GET"), false, path);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) assert.equal(publicRequestAllowed("/api/syntheses", method), false);
    for (const [key, value] of Object.entries(getAppCapabilities())) if (key !== "mode") assert.equal(value, false);
    process.env.APP_MODE = "private";
    assert.equal(publicRequestAllowed("/api/processing-runs", "POST"), true);
    assert.equal(getAppCapabilities().canAskAI, true);
    process.env.APP_MODE = "typo"; assert.throws(getAppCapabilities, /APP_MODE/);
  } finally { if (old === undefined) delete process.env.APP_MODE; else process.env.APP_MODE = old; }
});
test("public runtime cannot construct operational database clients, even with private secrets present", () => {
  const old = process.env.APP_MODE;
  try {
    process.env.APP_MODE="public_read_only";
    assert.throws(getSupabaseEnvironment,/disabled/);
    assert.throws(createSupabaseServerClient,/operational database is unavailable/);
  } finally { if (old===undefined) delete process.env.APP_MODE; else process.env.APP_MODE=old; }
});
