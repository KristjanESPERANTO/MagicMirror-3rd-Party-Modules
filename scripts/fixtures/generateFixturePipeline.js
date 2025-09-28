#!/usr/bin/env node

import {fileURLToPath} from "node:url";
import fs from "node:fs";
import path from "node:path";

const FILE_URL = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(FILE_URL), "..", "..");

function readJson (relativePath) {
  const filePath = path.join(ROOT_DIR, relativePath);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson (relativePath, data) {
  const filePath = path.join(ROOT_DIR, relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function clone (value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureMetadata (id, metadata) {
  const info = metadata.modules[id];
  if (!info) {
    throw new Error(`Missing metadata entry for module id ${id}`);
  }
  return info;
}

function buildStage2Entry (seedModule, info) {
  const base = clone(seedModule);
  if (typeof info.stars === "number") {
    base.stars = info.stars;
  }
  if (info.license) {
    base.license = info.license;
  }
  return base;
}

function buildStage4Entry (stage2Module, info) {
  const entry = clone(stage2Module);
  entry.issues = Array.isArray(info.issuesStage4)
    ? clone(info.issuesStage4)
    : clone(stage2Module.issues ?? []);

  if (Array.isArray(info.tags) && info.tags.length > 0) {
    entry.tags = clone(info.tags);
  } else {
    delete entry.tags;
  }

  if (info.image) {
    entry.image = info.image;
  } else {
    delete entry.image;
  }

  return entry;
}

function buildFinalEntry (seedModule, info) {
  const entry = {
    name: seedModule.name,
    category: seedModule.category,
    url: seedModule.url,
    id: seedModule.id,
    maintainer: seedModule.maintainer,
    maintainerURL: seedModule.maintainerURL,
    description: seedModule.description,
    issues: Boolean(info.issuesFinal),
    stars: info.stars,
    license: info.license,
    defaultSortWeight: info.defaultSortWeight,
    lastCommit: info.lastCommit
  };

  if (seedModule.outdated || info.outdated) {
    entry.outdated = seedModule.outdated ?? info.outdated;
  }

  if (Array.isArray(info.tags) && info.tags.length > 0) {
    entry.tags = clone(info.tags);
  }

  if (info.image) {
    entry.image = info.image;
  }

  return entry;
}

function hostKeyFromUrl (url) {
  try {
    const {hostname} = new URL(url);
    const cleaned = hostname.toLowerCase().replace(/^www\./u, "");
    const [firstSegment] = cleaned.split(".");
    return firstSegment || "unknown";
  } catch {
    return "unknown";
  }
}

function buildStats (seed, metadata, finalModules) {
  const moduleCounter = finalModules.length;
  const modulesWithImageCounter = finalModules.filter((module) => typeof module.image === "string" && module.image.length > 0).length;
  const modulesWithIssuesCounter = finalModules.filter((module) => module.issues === true).length;
  const issueCounter = seed.modules.reduce((sum, module) => {
    const info = ensureMetadata(module.id, metadata);
    const issues = Array.isArray(info.issuesStage4) ? info.issuesStage4.length : 0;
    return sum + issues;
  }, 0);

  const repositoryHoster = finalModules.reduce((accumulator, module) => {
    const key = hostKeyFromUrl(module.url);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const maintainer = finalModules.reduce((accumulator, module) => {
    accumulator[module.maintainer] = (accumulator[module.maintainer] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    moduleCounter,
    modulesWithImageCounter,
    modulesWithIssuesCounter,
    issueCounter,
    lastUpdate: seed.lastUpdate,
    repositoryHoster,
    maintainer
  };
}

function main () {
  const seed = readJson("fixtures/modules.seed.json");
  const metadata = readJson("fixtures/modules.metadata.json");

  const stage1 = clone(seed);
  writeJson(path.join("fixtures", "data", "modules.stage.1.json"), stage1);

  const stage2Modules = seed.modules.map((module) => {
    const info = ensureMetadata(module.id, metadata);
    return buildStage2Entry(module, info);
  });
  writeJson(path.join("fixtures", "data", "modules.stage.2.json"), stage2Modules);

  const stage3 = {modules: clone(stage2Modules)};
  writeJson(path.join("fixtures", "data", "modules.stage.3.json"), stage3);

  const stage4Modules = stage2Modules.map((module) => {
    const info = ensureMetadata(module.id, metadata);
    return buildStage4Entry(module, info);
  });
  writeJson(path.join("fixtures", "data", "modules.stage.4.json"), {modules: stage4Modules});

  const stage5 = {modules: clone(stage4Modules)};
  writeJson(path.join("fixtures", "data", "modules.stage.5.json"), stage5);

  const finalModules = seed.modules.map((module) => {
    const info = ensureMetadata(module.id, metadata);
    return buildFinalEntry(module, info);
  });
  writeJson(path.join("fixtures", "data", "modules.json"), {modules: finalModules});

  writeJson(path.join("fixtures", "data", "modules.min.json"), {modules: finalModules});

  const stats = buildStats(seed, metadata, finalModules);
  writeJson(path.join("fixtures", "data", "stats.json"), stats);

  console.log(`Generated fixture pipeline for ${finalModules.length} modules.`);
}

main();
