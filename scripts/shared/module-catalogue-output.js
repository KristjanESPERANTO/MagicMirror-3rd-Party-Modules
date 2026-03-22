import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringifyDeterministic } from "./deterministic-output.js";

const STAGE5_ALLOWED_KEYS = [
  "name",
  "category",
  "url",
  "id",
  "maintainer",
  "maintainerURL",
  "description",
  "outdated",
  "issues",
  "stars",
  "license",
  "hasGithubIssues",
  "isArchived",
  "lastCommit",
  "keywords",
  "tags",
  "image",
  "packageJson"
];

const FINAL_ALLOWED_KEYS = [
  "name",
  "category",
  "url",
  "id",
  "maintainer",
  "maintainerURL",
  "description",
  "outdated",
  "issues",
  "stars",
  "license",
  "hasGithubIssues",
  "isArchived",
  "tags",
  "image",
  "defaultSortWeight",
  "lastCommit",
  "keywords"
];

export function toStage5Module(module) {
  const entry = {};

  for (const key of STAGE5_ALLOWED_KEYS) {
    if (Object.hasOwn(module, key) && typeof module[key] !== "undefined") {
      entry[key] = module[key];
    }
  }

  if (!Array.isArray(entry.issues)) {
    entry.issues = [];
  }

  return entry;
}

function isValidDateTime(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function getRepositoryHost(moduleUrl) {
  if (typeof moduleUrl !== "string") {
    return "unknown";
  }

  try {
    const firstSegment = moduleUrl.split(".")[0];
    const segments = firstSegment.split("/");
    return segments[2] ?? "unknown";
  }
  catch {
    return "unknown";
  }
}

function toFinalModule(module, fallbackTimestamp) {
  const issueList = Array.isArray(module.issues) ? module.issues : [];
  const stars = typeof module.stars === "number" ? module.stars : 0;

  let defaultSortWeight = issueList.length - Math.floor(stars / 20);
  if (stars < 3) {
    defaultSortWeight = Math.max(defaultSortWeight, 1);
  }

  if (module.outdated || module.category === "Outdated Modules") {
    defaultSortWeight += 900;
  }

  const candidate = {
    ...module,
    description:
      typeof module.description === "string" && module.description.length > 0
        ? module.description
        : "No description provided.",
    issues: issueList.length > 0,
    defaultSortWeight,
    lastCommit: isValidDateTime(module.lastCommit)
      ? module.lastCommit
      : fallbackTimestamp
  };

  if (typeof candidate.license !== "string" || candidate.license.length === 0) {
    delete candidate.license;
  }

  if (!Array.isArray(candidate.tags) || candidate.tags.length === 0) {
    delete candidate.tags;
  }

  if (!Array.isArray(candidate.keywords) || candidate.keywords.length === 0) {
    delete candidate.keywords;
  }

  const entry = {};
  for (const key of FINAL_ALLOWED_KEYS) {
    if (Object.hasOwn(candidate, key) && typeof candidate[key] !== "undefined") {
      entry[key] = candidate[key];
    }
  }

  return entry;
}

function buildStats(stage5Modules, finalModules, timestamp) {
  const repositoryHoster = {};
  const maintainer = {};

  for (const module of finalModules) {
    const hoster = getRepositoryHost(module.url);
    repositoryHoster[hoster] = (repositoryHoster[hoster] ?? 0) + 1;
    maintainer[module.maintainer] = (maintainer[module.maintainer] ?? 0) + 1;
  }

  const issueCounter = stage5Modules.reduce((count, module) => {
    if (Array.isArray(module.issues)) {
      return count + module.issues.length;
    }
    return count;
  }, 0);

  return {
    moduleCounter: finalModules.length,
    modulesWithImageCounter: finalModules.filter(module => typeof module.image === "string" && module.image.length > 0).length,
    modulesWithIssuesCounter: finalModules.filter(module => module.issues === true).length,
    issueCounter,
    lastUpdate: timestamp,
    repositoryHoster,
    maintainer: Object.fromEntries(
      Object.entries(maintainer).sort(([, left], [, right]) => right - left)
    )
  };
}

function normalizeModuleCollection(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.modules)) {
    return payload.modules;
  }

  return null;
}

function isValidIsoDateTime(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function areModulesEqual(left, right) {
  return stringifyDeterministic(left, 0) === stringifyDeterministic(right, 0);
}

function buildModuleDiffSummary(previousModules, nextModules) {
  if (!Array.isArray(previousModules)) {
    return {
      addedCount: nextModules.length,
      changedCount: 0,
      hasChanges: nextModules.length > 0,
      removedCount: 0,
      unchangedCount: 0
    };
  }

  const previousById = new Map();
  for (const module of previousModules) {
    if (module && typeof module.id === "string") {
      previousById.set(module.id, module);
    }
  }

  const nextById = new Map();
  for (const module of nextModules) {
    if (module && typeof module.id === "string") {
      nextById.set(module.id, module);
    }
  }

  let addedCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;

  for (const [moduleId, nextModule] of nextById) {
    const previousModule = previousById.get(moduleId);

    if (!previousModule) {
      addedCount += 1;
    }
    else if (areModulesEqual(previousModule, nextModule)) {
      unchangedCount += 1;
    }
    else {
      changedCount += 1;
    }
  }

  let removedCount = 0;
  for (const moduleId of previousById.keys()) {
    if (!nextById.has(moduleId)) {
      removedCount += 1;
    }
  }

  return {
    addedCount,
    changedCount,
    hasChanges: addedCount > 0 || changedCount > 0 || removedCount > 0,
    removedCount,
    unchangedCount
  };
}

async function readJsonIfExists(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function allFilesExist(paths) {
  for (const path of paths) {
    try {
      await access(path);
    }
    catch {
      return false;
    }
  }

  return true;
}

export async function writeStage5Output(stage5Modules, projectRoot) {
  const stage5Path = resolve(projectRoot, "website/data/modules.stage.5.json");

  await writeFile(stage5Path, stringifyDeterministic({ modules: stage5Modules }), "utf-8");
  return stage5Path;
}

export async function writePublishedCatalogueOutputs(stage5Modules, projectRoot) {
  const modulesJsonPath = resolve(projectRoot, "website/data/modules.json");
  const modulesMinPath = resolve(projectRoot, "website/data/modules.min.json");
  const statsPath = resolve(projectRoot, "website/data/stats.json");

  const previousModulesPayload = await readJsonIfExists(modulesJsonPath);
  const previousModules = normalizeModuleCollection(previousModulesPayload);
  const previousStats = await readJsonIfExists(statsPath);
  const previousLastUpdate = isValidIsoDateTime(previousStats?.lastUpdate)
    ? previousStats.lastUpdate
    : null;
  const nowTimestamp = new Date().toISOString();
  const comparisonTimestamp = previousLastUpdate ?? nowTimestamp;
  const comparableFinalModules = stage5Modules.map(module => toFinalModule(module, comparisonTimestamp));
  const changeSummary = buildModuleDiffSummary(previousModules, comparableFinalModules);

  const outputsAlreadyPresent = await allFilesExist([modulesJsonPath, modulesMinPath, statsPath]);
  const shouldSkipWrites = !changeSummary.hasChanges && outputsAlreadyPresent;

  if (shouldSkipWrites) {
    return {
      changeSummary,
      modulesJsonPath,
      modulesMinPath,
      outputPaths: {
        modulesJsonPath,
        modulesMinPath,
        statsPath
      },
      statsPath,
      wroteOutputs: false
    };
  }

  const lastUpdate = changeSummary.hasChanges ? nowTimestamp : comparisonTimestamp;
  const finalModules = changeSummary.hasChanges && lastUpdate !== comparisonTimestamp
    ? stage5Modules.map(module => toFinalModule(module, lastUpdate))
    : comparableFinalModules;
  const stats = buildStats(stage5Modules, finalModules, lastUpdate);

  await writeFile(modulesJsonPath, stringifyDeterministic({ modules: finalModules }), "utf-8");
  await writeFile(modulesMinPath, stringifyDeterministic({ modules: finalModules }, 0), "utf-8");
  await writeFile(statsPath, stringifyDeterministic(stats), "utf-8");

  return {
    changeSummary,
    modulesJsonPath,
    modulesMinPath,
    outputPaths: {
      modulesJsonPath,
      modulesMinPath,
      statsPath
    },
    statsPath,
    wroteOutputs: true
  };
}

export async function writePipelineOutputs(stage5Modules, projectRoot) {
  const stage5Path = await writeStage5Output(stage5Modules, projectRoot);
  await writePublishedCatalogueOutputs(stage5Modules, projectRoot);
  return stage5Path;
}
