import { DEFAULT_CHECK_GROUP_CONFIG, loadCheckGroupConfig } from "../config.js";

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function createTempProjectRoot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mm-check-config-"));
  return dir;
}

async function ensureConfigDir(root) {
  const dir = path.join(root, "scripts", "check-modules");
  await mkdir(dir, { recursive: true });
  return dir;
}

test("falls back to default configuration when files are missing", async () => {
  const root = await createTempProjectRoot();
  const result = await loadCheckGroupConfig({ projectRoot: root });

  assert.deepEqual(result.config, DEFAULT_CHECK_GROUP_CONFIG);
  assert.equal(result.errors.length, 0);
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every(entry => entry.missing === true));
});

test("applies base configuration overrides", async () => {
  const root = await createTempProjectRoot();
  const dir = await ensureConfigDir(root);
  const basePath = path.join(dir, "check-groups.config.json");

  await writeFile(
    basePath,
    JSON.stringify({
      groups: {
        fast: false
      },
      integrations: {
        npmCheckUpdates: false
      }
    })
  );

  const result = await loadCheckGroupConfig({ projectRoot: root });

  assert.equal(result.config.groups.fast, false);
  assert.equal(result.config.groups.deep, true);
  assert.equal(result.config.integrations.npmCheckUpdates, false);
  assert.equal(result.config.integrations.eslint, true);
});

test("local overrides take precedence over base configuration", async () => {
  const root = await createTempProjectRoot();
  const dir = await ensureConfigDir(root);
  const basePath = path.join(dir, "check-groups.config.json");
  const localPath = path.join(dir, "check-groups.config.local.json");

  await writeFile(
    basePath,
    JSON.stringify({
      groups: {
        fast: false,
        deep: true
      },
      integrations: {
        npmDeprecatedCheck: false
      }
    })
  );

  await writeFile(
    localPath,
    JSON.stringify({
      groups: {
        deep: false
      },
      integrations: {
        eslint: false
      }
    })
  );

  const result = await loadCheckGroupConfig({ projectRoot: root });
  assert.equal(result.config.groups.fast, false);
  assert.equal(result.config.groups.deep, false);
  assert.equal(result.config.integrations.npmDeprecatedCheck, false);
  assert.equal(result.config.integrations.eslint, false);
  const localEntry = result.sources.find(entry => entry.kind === "local");
  assert.ok(localEntry?.applied);
});

test("reports parse errors while continuing with defaults", async () => {
  const root = await createTempProjectRoot();
  const dir = await ensureConfigDir(root);
  const basePath = path.join(dir, "check-groups.config.json");
  const localPath = path.join(dir, "check-groups.config.local.json");

  await writeFile(basePath, "{invalid json");
  await writeFile(
    localPath,
    JSON.stringify({
      integrations: {
        npmCheckUpdates: false
      }
    })
  );

  const result = await loadCheckGroupConfig({ projectRoot: root });
  assert.equal(result.config.integrations.npmCheckUpdates, false);
  assert.equal(result.errors.length, 1);
  const message = result.errors[0]?.error?.message ?? "";
  assert.match(message, /JSON/u);
});
