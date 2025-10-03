#!/usr/bin/env node
import {fileURLToPath} from "node:url";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDirPath, "..", "..");

const PLACEHOLDER_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const mode = (process.argv[2] ?? "check").toLowerCase();
if (!["check", "update"].includes(mode)) {
  console.error(`Invalid mode "${mode}". Use "check" or "update".`);
  process.exit(1);
}

function readJson (filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to read JSON from ${filePath}: ${error.message}`, {cause: error});
  }
}

function deepSortObject (value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepSortObject(item));
  }

  if (value && typeof value === "object" && value.constructor === Object) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = deepSortObject(value[key]);
    }
    return sorted;
  }

  return value;
}

function compareById (a, b) {
  const idA = (a?.id ?? a?.name ?? "").toString();
  const idB = (b?.id ?? b?.name ?? "").toString();
  return idA.localeCompare(idB, "en", {sensitivity: "base"});
}

function sanitizeModulesArray (modules = []) {
  return [...modules]
    .map((module) => deepSortObject(module))
    .sort(compareById);
}

function sanitizeRepositoryArray (repositories = []) {
  return [...repositories]
    .map((repo) => deepSortObject(repo))
    .sort(compareById);
}

function sanitizeModulesContainer (data) {
  const sanitized = deepSortObject(data ?? {});
  if (Array.isArray(data?.modules)) {
    sanitized.modules = sanitizeModulesArray(data.modules);
  }
  if (Object.hasOwn(sanitized, "lastUpdate")) {
    sanitized.lastUpdate = PLACEHOLDER_TIMESTAMP;
  }
  return sanitized;
}

function sanitizeStage1 (data) {
  return {
    lastUpdate: PLACEHOLDER_TIMESTAMP,
    modules: sanitizeModulesArray(data?.modules ?? [])
  };
}

function sanitizeStage2 (modules) {
  return sanitizeModulesArray(modules);
}

function sanitizeStage3 (data) {
  return sanitizeModulesContainer(data);
}

function sanitizeStage4 (data) {
  return sanitizeModulesContainer(data);
}

function sanitizeStage5 (data) {
  return sanitizeModulesContainer(data);
}

function sanitizeFinalModules (data) {
  return sanitizeModulesContainer(data);
}

function sanitizeStats (data) {
  const sanitized = deepSortObject(data ?? {});
  if (Object.hasOwn(sanitized, "lastUpdate")) {
    sanitized.lastUpdate = PLACEHOLDER_TIMESTAMP;
  }
  return sanitized;
}

function sanitizeGitHubData (data) {
  return {
    lastUpdate: PLACEHOLDER_TIMESTAMP,
    repositories: sanitizeRepositoryArray(data?.repositories ?? [])
  };
}

function sanitizeSkippedModules (data) {
  return sanitizeModulesArray(data ?? []);
}

const artifacts = [
  {
    name: "modules.stage.1",
    source: path.join(repoRoot, "website/data/modules.stage.1.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.stage.1.json"),
    sanitize: sanitizeStage1
  },
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
  },
  {
    name: "skipped_modules",
    source: path.join(repoRoot, "website/data/skipped_modules.json"),
    target: path.join(repoRoot, "fixtures/golden/skipped_modules.json"),
    sanitize: sanitizeSkippedModules
  }
];

function stableStringify (value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function processArtifact (artifact) {
  const {name, source, target, sanitize} = artifact;

  if (!fs.existsSync(source)) {
    return `Source artifact missing: ${source}`;
  }

  const input = readJson(source);
  const sanitized = sanitize(input);
  const serialized = stableStringify(sanitized);

  if (mode === "update") {
    fs.mkdirSync(path.dirname(target), {recursive: true});
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
  .map((artifact) => processArtifact(artifact))
  .filter((message) => Boolean(message));

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
