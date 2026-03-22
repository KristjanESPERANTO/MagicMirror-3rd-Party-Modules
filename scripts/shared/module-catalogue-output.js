import { resolve } from "node:path";
import { stringifyDeterministic } from "./deterministic-output.js";
import { writeFile } from "node:fs/promises";

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

export async function writeStage5Output(stage5Modules, projectRoot) {
  const stage5Path = resolve(projectRoot, "website/data/modules.stage.5.json");

  await writeFile(stage5Path, stringifyDeterministic({ modules: stage5Modules }), "utf-8");
  return stage5Path;
}

export async function writePublishedCatalogueOutputs(stage5Modules, projectRoot) {
  const modulesJsonPath = resolve(projectRoot, "website/data/modules.json");
  const modulesMinPath = resolve(projectRoot, "website/data/modules.min.json");
  const statsPath = resolve(projectRoot, "website/data/stats.json");

  const lastUpdate = new Date().toISOString();
  const finalModules = stage5Modules.map(module => toFinalModule(module, lastUpdate));
  const stats = buildStats(stage5Modules, finalModules, lastUpdate);

  await writeFile(modulesJsonPath, stringifyDeterministic({ modules: finalModules }), "utf-8");
  await writeFile(modulesMinPath, stringifyDeterministic({ modules: finalModules }, 0), "utf-8");
  await writeFile(statsPath, stringifyDeterministic(stats), "utf-8");

  return {
    modulesJsonPath,
    modulesMinPath,
    statsPath
  };
}

export async function writePipelineOutputs(stage5Modules, projectRoot) {
  const stage5Path = await writeStage5Output(stage5Modules, projectRoot);
  await writePublishedCatalogueOutputs(stage5Modules, projectRoot);
  return stage5Path;
}
