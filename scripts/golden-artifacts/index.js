#!/usr/bin/env node
import {
  sanitizeFinalModules,
  sanitizeGitHubData,
  sanitizeStage2,
  sanitizeStage3,
  sanitizeStage4,
  sanitizeStage5,
  sanitizeStats,
  stableStringify
} from "./sanitizers.js";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDirPath, "..", "..");

const mode = (process.argv[2] ?? "check").toLowerCase();
if (!["check", "update"].includes(mode)) {
  console.error(`Invalid mode "${mode}". Use "check" or "update".`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  }
  catch (error) {
    throw new Error(`Unable to read JSON from ${filePath}: ${error.message}`, { cause: error });
  }
}

const artifacts = [
  {
    name: "modules.stage.2",
    source: path.join(repoRoot, "website/data/modules.stage.2.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.stage.2.json"),
    sanitize: sanitizeStage2
  },
  {
    name: "modules.stage.3",
    source: path.join(repoRoot, "website/data/modules.stage.3.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.stage.3.json"),
    sanitize: sanitizeStage3
  },
  {
    name: "modules.stage.4",
    source: path.join(repoRoot, "website/data/modules.stage.4.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.stage.4.json"),
    sanitize: sanitizeStage4
  },
  {
    name: "modules.stage.5",
    source: path.join(repoRoot, "website/data/modules.stage.5.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.stage.5.json"),
    sanitize: sanitizeStage5
  },
  {
    name: "modules.final",
    source: path.join(repoRoot, "website/data/modules.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.json"),
    sanitize: sanitizeFinalModules
  },
  {
    name: "stats",
    source: path.join(repoRoot, "website/data/stats.json"),
    target: path.join(repoRoot, "fixtures/golden/stats.json"),
    sanitize: sanitizeStats
  },
  {
    name: "gitHubData",
    source: path.join(repoRoot, "website/data/gitHubData.json"),
    target: path.join(repoRoot, "fixtures/golden/gitHubData.json"),
    sanitize: sanitizeGitHubData
  }

  /*
   * Note: skipped_modules.json is intentionally excluded from golden artifacts
   * as it's non-deterministic and depends on current repository availability
   */
];

function processArtifact(artifact) {
  const { name, source, target, sanitize } = artifact;

  if (!fs.existsSync(source)) {
    return `Source artifact missing: ${source}`;
  }

  const input = readJson(source);
  const sanitized = sanitize(input);
  const serialized = stableStringify(sanitized);

  if (mode === "update") {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized, "utf8");
    console.log(`Updated golden artifact for ${name}`);
    return null;
  }

  if (!fs.existsSync(target)) {
    return `Golden artifact missing for ${name}. Run npm run golden:update.`;
  }

  const expectedRaw = fs.readFileSync(target, "utf8");
  if (expectedRaw !== serialized) {
    return `Mismatch detected for ${name}.`;
  }

  return null;
}

const discrepancies = artifacts
  .map(artifact => processArtifact(artifact))
  .filter(message => Boolean(message));

if (mode === "check") {
  if (discrepancies.length > 0) {
    console.error("\nGolden artifact verification failed:\n");
    for (const message of discrepancies) {
      console.error(` • ${message}`);
    }
    console.error("\nRun \"npm run golden:update\" and commit the refreshed artifacts if the changes are expected.");
    process.exit(1);
  }
  console.log("Golden artifacts match the current pipeline outputs.");
}
