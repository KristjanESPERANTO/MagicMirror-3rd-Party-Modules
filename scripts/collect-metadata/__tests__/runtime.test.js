import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import process from "node:process";
import { test } from "node:test";
import { tmpdir } from "node:os";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = resolve(currentFile, "..");
const projectRoot = resolve(currentDir, "..", "..", "..");

test("local-only metadata uses the previous catalogue and discards old findings", async () => {
  const { runCollectMetadata } = await import("../index.ts");
  const module = {
    id: "example/MMM-Local",
    name: "MMM-Local",
    maintainer: "example",
    url: "not-a-network-url",
    issues: ["Old finding"],
    lastCommit: "2026-01-01T00:00:00Z"
  };
  const result = await runCollectMetadata({
    localOnly: true,
    previousModulesMap: new Map([[module.url, module]])
  });
  deepEqual(result.modules, [{ ...module, issues: [] }]);
  deepEqual(module.issues, ["Old finding"]);
});

test("local-only metadata fails without a previous catalogue", async () => {
  const { runCollectMetadata } = await import("../index.ts");
  await rejects(runCollectMetadata({ localOnly: true, previousModulesMap: new Map() }), /requires an existing website\/data\/modules\.json/u);
});

test("runCollectMetadata retries repositories even when a stale negative cache entry exists", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "collect-metadata-runtime-test-"));
  const cacheDir = join(tempRoot, "website", "data", "cache");
  const cachePath = join(cacheDir, "repository-api-cache.json");
  const repoId = "MagicMirrorOrg/MagicMirror";
  const cachePayload = {
    version: "repository-api/v2",
    generatedAt: "2026-06-24T00:00:00.000Z",
    entries: {
      [repoId]: {
        updatedAt: "2026-06-24T00:00:00.000Z",
        expiresAt: "2026-06-27T00:00:00.000Z",
        ttlMs: 259200000,
        value: {
          isFailed: true,
          error: "API Error: 404 "
        }
      }
    }
  };

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cachePayload, null, 2)}\n`, "utf8");

  const previousCwd = process.cwd();
  const previousToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  process.chdir(tempRoot);

  try {
    const moduleUrl = `${pathToFileURL(join(projectRoot, "scripts", "collect-metadata", "index.ts")).href}?test=${Date.now()}`;
    const { runCollectMetadata } = await import(moduleUrl);
    const markdown = `
### Test
| [MagicMirror](https://github.com/MagicMirrorOrg/MagicMirror) | [MagicMirrorOrg](https://github.com/MagicMirrorOrg) | core repo |
`;

    const { modules } = await runCollectMetadata({ markdown, previousModulesMap: new Map() });
    equal(modules.length, 1);
    equal(modules[0].name, "MagicMirror");
    equal("notFound" in modules[0], false);
    ok(modules[0].lastCommit, "expected live metadata fetch to populate lastCommit");

    const persistedCache = JSON.parse(await (await import("node:fs/promises")).readFile(cachePath, "utf8"));
    deepEqual("isFailed" in persistedCache.entries[repoId].value, false);
  }
  finally {
    process.chdir(previousCwd);
    if (typeof previousToken === "string") {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});
