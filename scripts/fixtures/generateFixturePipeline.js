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

function writeJson (relativePath, data, options = {}) {
  const {minified = false} = options;
  const filePath = path.join(ROOT_DIR, relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const serialized = minified
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, `${serialized}\n`, "utf8");
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

function deriveMaintainerUrl (module) {
  const raw = (module.maintainerURL ?? "").trim();
  if (raw.length > 0) {
    return raw;
  }

  if (module.url) {
    try {
      const repoUrl = new URL(module.url);
      const segments = repoUrl.pathname.split("/").filter(Boolean);
      if (module.maintainer) {
        return `${repoUrl.origin}/${module.maintainer}`;
      }
      if (segments.length > 0) {
        return `${repoUrl.origin}/${segments[0]}`;
      }
      return repoUrl.origin;
    } catch {
      // Fall through to GitHub fallback.
    }
  }

  if (module.maintainer) {
    return `https://github.com/${module.maintainer}`;
  }

  throw new Error(`Unable to derive maintainer URL for module ${module.id ?? module.name ?? "<unknown>"}`);
}

function normalizeStage1Module (module) {
  const entry = clone(module);
  entry.maintainerURL = deriveMaintainerUrl(entry);

  if (Array.isArray(entry.issues)) {
    entry.issues = [...entry.issues];
  } else {
    entry.issues = [];
  }

  return entry;
}

function sortModulesById (modules) {
  return [...modules].sort((a, b) => a.id.localeCompare(b.id));
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

function buildFinalEntry (stage1Module, info) {
  const entry = {
    name: stage1Module.name,
    category: stage1Module.category,
    url: stage1Module.url,
    id: stage1Module.id,
    maintainer: stage1Module.maintainer,
    maintainerURL: stage1Module.maintainerURL,
    description: stage1Module.description,
    issues: Boolean(info.issuesFinal),
    stars: info.stars,
    license: info.license,
    defaultSortWeight: info.defaultSortWeight,
    lastCommit: info.lastCommit
  };

  if (stage1Module.outdated || info.outdated) {
    entry.outdated = stage1Module.outdated ?? info.outdated;
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

  const normalizedStage1Modules = sortModulesById(seed.modules.map(normalizeStage1Module));
  const stage1 = {
    lastUpdate: seed.lastUpdate,
    modules: normalizedStage1Modules
  };
  writeJson(path.join("fixtures", "data", "modules.stage.1.json"), stage1);

  const stage2Modules = normalizedStage1Modules.map((module) => {
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

  const finalModules = normalizedStage1Modules.map((module) => {
    const info = ensureMetadata(module.id, metadata);
    return buildFinalEntry(module, info);
  });
  const sortedFinalModules = sortModulesById(finalModules);
  writeJson(path.join("fixtures", "data", "modules.json"), {modules: sortedFinalModules});

  writeJson(path.join("fixtures", "data", "modules.min.json"), {modules: sortedFinalModules}, {minified: true});

  const stats = buildStats(stage1, metadata, sortedFinalModules);
  writeJson(path.join("fixtures", "data", "stats.json"), stats);

  console.log(`Generated fixture pipeline for ${sortedFinalModules.length} modules.`);
}

main();
