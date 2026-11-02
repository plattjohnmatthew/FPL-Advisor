import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const patterns = [
  ["credential-token", /(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|sb_secret_[A-Za-z0-9_-]{24,}|vercel_blob_rw_[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["jwt", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
  ["credential-url", /(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/],
];

// Returns categories only. Never include matched text in logs or the report.
export function repositorySecretKinds(text, secrets = []) {
  const kinds = patterns.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
  for (const value of secrets) {
    if (typeof value !== "string" || value.length < 12) continue;
    const variants = [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value), Buffer.from(value).toString("base64")];
    if (variants.some(secret => text.includes(secret))) { kinds.push("known-local-secret"); break; }
  }
  return kinds;
}

export function parseGitBatch(buffer) {
  const objects = [];
  for (let offset = 0; offset < buffer.length;) {
    const newline = buffer.indexOf(10, offset);
    if (newline < 0) throw new Error("Incomplete Git object header");
    const [id, type, sizeText] = buffer.subarray(offset, newline).toString().split(" ");
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0 || newline + 1 + size >= buffer.length) throw new Error("Incomplete Git object body");
    objects.push({ id, type, body: buffer.subarray(newline + 1, newline + 1 + size) });
    offset = newline + 1 + size + 1;
  }
  return objects;
}

function main() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const secrets = Object.entries(process.env).filter(([key, value]) => /(?:KEY|TOKEN|PASSWORD|SECRET)/.test(key) && value?.length >= 12).map(([, value]) => value);
  const git = (...args) => execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024 });
  const entries = git("rev-list", "--objects", "--all").toString().trim().split("\n").filter(Boolean).map(line => {
    const space = line.indexOf(" ");
    return space < 0 ? [line, ""] : [line.slice(0, space), line.slice(space + 1)];
  });
  const paths = new Map(entries);
  const batch = execFileSync("git", ["cat-file", "--batch"], { input: entries.map(([id]) => id).join("\n") + "\n", maxBuffer: 256 * 1024 * 1024 });
  const objects = parseGitBatch(batch);
  const findings = [];
  for (const object of objects) {
    if (!["blob", "commit", "tag"].includes(object.type)) continue;
    const kinds = repositorySecretKinds(object.body.toString(), secrets);
    if (kinds.length) findings.push({ scope: "history", object: object.id, path: paths.get(object.id), kinds });
  }
  const files = [...new Set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard").toString().split("\0").filter(Boolean))];
  for (const path of files) {
    if (!existsSync(path)) continue;
    const kinds = repositorySecretKinds(readFileSync(path).toString(), secrets);
    if (kinds.length) findings.push({ scope: "working-tree", path, kinds });
  }
  const sensitivePath = /(?:^|\/)(?:\.env(?:\..*)?|\.temp\/.*|[^/]*\.(?:pem|key|p12|pfx)|.*(?:dump|backup)\.sql)$/i;
  const privatePaths = [...new Set([...entries.map(([, path]) => path), ...files])].filter(path => path !== ".env.example" && sensitivePath.test(path));
  const binaryFiles = files.filter(path => /\.(?:png|jpe?g|pdf|zip|mp4)$/i.test(path));
  const report = {
    result: findings.length || privatePaths.length || binaryFiles.length ? "REVIEW REQUIRED" : "PASS",
    scope: "All locally fetched refs, commit/tag messages and Git blobs; tracked and non-ignored working files. Ignored private files are comparison inputs only.",
    commits: Number(git("rev-list", "--all", "--count").toString()),
    historyBlobs: objects.filter(object => object.type === "blob").length,
    workingFiles: files.length,
    knownLocalSecretsCompared: secrets.length,
    findings, privatePaths, binaryFiles,
    limits: "Pattern and known-value checks are not a proof of absence. GitHub Actions logs, issues, releases, hidden PR refs and server-side unreachable objects require separate account review. Application prompt source code becomes public intentionally; private database custom instructions are not exported.",
  };
  writeFileSync("docs/repository-audit.json", JSON.stringify(report, null, 2) + "\n");
  console.log(`Repository audit: ${report.result}; ${report.commits} commits, ${report.historyBlobs} historical blobs, ${report.workingFiles} working files; ${findings.length} secret findings, ${privatePaths.length} private paths, ${binaryFiles.length} binary files needing review. See docs/repository-audit.json.`);
  if (report.result !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
