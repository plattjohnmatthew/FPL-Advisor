import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error The standalone audit is JavaScript, independent of application runtime.
import { repositorySecretKinds, parseGitBatch } from "../../scripts/audit-repository.mjs";

test("repository scan detects encoded known credentials without returning their values", () => {
  const secret = "private-test-value-with-$-and-spaces";
  for (const encoded of [secret, encodeURIComponent(secret), Buffer.from(secret).toString("base64")]) {
    assert.deepEqual(repositorySecretKinds(encoded, [secret]), ["known-local-secret"]);
  }
  assert.deepEqual(repositorySecretKinds("OPENAI_API_KEY=your-openai-api-key\nSUPABASE_SECRET_KEY=sb_secret_your-secret-key"), []);
  assert.deepEqual(repositorySecretKinds("sk-proj-" + "a".repeat(40)), ["credential-token"]);
});

test("Git batch parser honors byte lengths across binary blobs and detects truncation", () => {
  const body = Buffer.from([0, 10, 255, 32]);
  const batch = Buffer.concat([Buffer.from("abc blob 4\n"), body, Buffer.from("\ndef commit 3\nxyz\n")]);
  const parsed = parseGitBatch(batch);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0].body, body);
  assert.equal(parsed[1].body.toString(), "xyz");
  assert.throws(() => parseGitBatch(batch.subarray(0, batch.length - 2)), /Incomplete/);
});
