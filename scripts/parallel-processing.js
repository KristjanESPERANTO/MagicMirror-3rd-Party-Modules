#!/usr/bin/env node
/**
 * Parallel Module Processing Stage (P7.3)
 *
 * Replaces stages 3+4+5 with parallel worker pool processing.
 * Reads modules.stage.2.json and outputs modules.stage.5.json
 */

import {
  MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache,
  getProjectRevision,
  normalizeModuleAnalysisCheckGroups,
  resolveModuleAnalysisCachePath
} from "../scripts/shared/module-analysis-cache.js";
import { readFile, writeFile } from "node:fs/promises";
import { WorkerPool } from "../pipeline/workers/worker-pool.js";
import { cpus } from "node:os";
import { createLogger } from "../scripts/shared/logger.js";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { resolve } from "node:path";
import { stringifyDeterministic } from "../scripts/shared/deterministic-output.js";

const logger = createLogger({ name: "parallel-processing" });
const PROJECT_ROOT = resolve(process.cwd());

/**
 * Get worker count from environment or CLI
 */
function getWorkerCount() {
  const envWorkers = process.env.PIPELINE_WORKER_COUNT;
  if (envWorkers) {
    return parseInt(envWorkers, 10);
  }

  // Check CLI args for --workers=N
  const workerArg = process.argv.find(arg => arg.startsWith("--workers="));
  if (workerArg) {
    return parseInt(workerArg.split("=")[1], 10);
  }

  // Default: CPU count - 1
  return Math.max(1, cpus().length - 1);
}

/**
 * Get batch size from CLI
 */
function getBatchSize() {
  const batchArg = process.argv.find(arg => arg.startsWith("--batch-size="));
  if (batchArg) {
    return parseInt(batchArg.split("=")[1], 10);
  }
  return 50; // Default batch size
}

/**
 * Check whether the module analysis cache is disabled for this run.
 * Disable via --no-cache CLI flag or PIPELINE_CACHE_DISABLED=1 env var.
 */
function isCacheDisabled() {
  if (process.env.PIPELINE_CACHE_DISABLED === "1") {
    return true;
  }
  return process.argv.includes("--no-cache");
}

/**
 * Prune cache entries that are stale for the current run (I5).
 * Stale means "key is no longer expected" due to removed modules
 * or key-input changes (module revision/check config/catalogue revision).
 *
 * @param {Object} cache Cache instance
 * @param {Array} modules Current module list
 * @param {{ catalogueRevision: string|null, analysisConfig: object }} options
 * @returns {number} Number of entries pruned
 */
export function pruneStaleCacheEntries(cache, modules, { catalogueRevision, analysisConfig }) {
  if (!catalogueRevision) {
    return 0;
  }

  const expectedKeys = new Set();
  for (const module of modules) {
    const cacheKey = buildModuleAnalysisCacheKey({
      module,
      moduleRevision: module.lastCommit,
      catalogueRevision,
      checkGroups: analysisConfig
    });

    if (cacheKey) {
      expectedKeys.add(cacheKey);
    }
  }

  let prunedCount = 0;
  for (const key of cache.getAllKeys()) {
    if (!expectedKeys.has(key)) {
      cache.delete(key);
      prunedCount += 1;
    }
  }

  return prunedCount;
}

/**
 * Partition modules into cache hits and misses.
 * Returns results for hits immediately; misses must be processed by workers.
 *
 * @param {Array} modules
 * @param {{ cache: object, catalogueRevision: string|null, analysisConfig: object }} options
 * @returns {{ cachedResults: Array, uncachedModules: Array }}
 */
export function partitionModulesByCache(modules, { cache, catalogueRevision, analysisConfig }) {
  const cachedResults = [];
  const uncachedModules = [];

  for (const module of modules) {
    const cacheKey = catalogueRevision
      ? buildModuleAnalysisCacheKey({
        module,
        moduleRevision: module.lastCommit,
        catalogueRevision,
        checkGroups: analysisConfig
      })
      : null;
    const entry = cacheKey ? cache.get(cacheKey) : null;

    if (entry) {
      cachedResults.push({
        ...entry.value,
        cacheKey,
        fromCache: true,
        status: "skipped",
        skippedReason: "cached"
      });
    }
    else {
      uncachedModules.push(module);
    }
  }

  return { cachedResults, uncachedModules };
}

/**
 * Build and write all stage output artifacts.
 *
 * @param {Array} stage5Modules
 * @param {string} projectRoot
 * @returns {Promise<string>} Resolves to the stage5 output path
 */
async function writePipelineOutputs(stage5Modules, projectRoot) {
  const stage5Path = resolve(projectRoot, "website/data/modules.stage.5.json");
  const modulesJsonPath = resolve(projectRoot, "website/data/modules.json");
  const modulesMinPath = resolve(projectRoot, "website/data/modules.min.json");
  const statsPath = resolve(projectRoot, "website/data/stats.json");

  const lastUpdate = new Date().toISOString();
  const finalModules = stage5Modules.map(module => toFinalModule(module, lastUpdate));
  const stats = buildStats(stage5Modules, finalModules, lastUpdate);

  await writeFile(stage5Path, stringifyDeterministic({ modules: stage5Modules }), "utf-8");
  await writeFile(modulesJsonPath, stringifyDeterministic({ modules: finalModules }), "utf-8");
  await writeFile(modulesMinPath, stringifyDeterministic({ modules: finalModules }, 0), "utf-8");
  await writeFile(statsPath, stringifyDeterministic(stats), "utf-8");

  return stage5Path;
}

/**
 * Write successful worker results to cache (I3).
 *
 * @param {Array} workerResults Worker results from pool.processModules
 * @param {Object} cache Cache instance
 * @param {string|null} catalogueRevision Current catalogue revision
 * @returns {number} Number of cache entries written
 */
export function writeSuccessfulResultsToCache(workerResults, cache, catalogueRevision) {
  if (!catalogueRevision || workerResults.length === 0) {
    return 0;
  }

  const metaKeys = new Set(["cacheKey", "fromCache", "processingTimeMs", "cloneDir", "moduleLogger"]);
  let writtenCount = 0;

  for (const result of workerResults) {
    if (result.status === "success" && result.cacheKey) {
      const cachedData = {};
      for (const [key, value] of Object.entries(result)) {
        if (!metaKeys.has(key)) {
          cachedData[key] = value;
        }
      }

      cache.set(result.cacheKey, cachedData);
      writtenCount += 1;
    }
  }

  return writtenCount;
}

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

function toStage5Module(module) {
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

async function main() {
  const startTime = Date.now();
  try {
    const stage2Path = resolve(PROJECT_ROOT, "website/data/modules.stage.2.json");
    logger.info(`Reading modules from ${stage2Path}...`);
    const modules = JSON.parse(await readFile(stage2Path, "utf-8"));
    logger.info(`Loaded ${modules.length} modules`);
    const workerCount = getWorkerCount();
    const batchSize = getBatchSize();
    const cacheDisabled = isCacheDisabled();
    logger.info(`Starting parallel processing with ${workerCount} workers, batch size ${batchSize}`);
    if (cacheDisabled) {
      logger.warn("Cache disabled (--no-cache / PIPELINE_CACHE_DISABLED): all modules will be processed fresh");
    }
    const pool = new WorkerPool({
      workerCount,
      batchSize,
      moduleTimeoutMs: 60000,
      batchTimeoutMs: 1800000
    });
    let processedCount = 0;
    pool.onProgress((event) => {
      if (event.type === "module" && event.status !== "started") {
        processedCount += 1;
        let status = "⊘";
        if (event.status === "success") {
          status = "✓";
        }
        else if (event.status === "failed") {
          status = "✗";
        }
        const cacheInfo = event.fromCache ? " (cached)" : "";
        logger.info(`[${processedCount}/${modules.length}] ${status} ${event.moduleId}${cacheInfo}`);
      }
    });
    const analysisConfig = normalizeModuleAnalysisCheckGroups({
      fast: true,
      deep: true,
      eslint: true,
      ncu: true
    });
    const catalogueRevision = await getProjectRevision(PROJECT_ROOT);
    if (!catalogueRevision) {
      logger.warn("Could not resolve current catalogue revision; module cache keys will be unavailable for this run");
    }
    const cachePath = resolveModuleAnalysisCachePath(PROJECT_ROOT);
    let cache = null;
    let prunedCount = 0;
    let cachedResults = [];
    let uncachedModules = modules;

    if (!cacheDisabled) {
      cache = createModuleAnalysisCache({ filePath: cachePath });
      await cache.load();
      prunedCount = pruneStaleCacheEntries(cache, modules, {
        catalogueRevision,
        analysisConfig
      });
      ({ cachedResults, uncachedModules } = partitionModulesByCache(modules, {
        cache,
        catalogueRevision,
        analysisConfig
      }));

      if (cachedResults.length > 0) {
        for (const result of cachedResults) {
          processedCount += 1;
          logger.info(`[${processedCount}/${modules.length}] ⊙ ${result.id} (cached)`);
        }
        logger.info(`Cache: ${cachedResults.length} hit(s), ${uncachedModules.length} to process`);
      }
    }
    const moduleConfig = {
      projectRoot: PROJECT_ROOT,
      modulesDir: resolve(PROJECT_ROOT, "modules"),
      modulesTempDir: resolve(PROJECT_ROOT, "modules_temp"),
      imagesDir: resolve(PROJECT_ROOT, "website/images"),
      cacheEnabled: !cacheDisabled,
      cachePath,
      cacheSchemaVersion: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
      catalogueRevision,
      analysisConfig,
      checkGroups: analysisConfig,
      timeoutMs: 60000
    };
    const workerResults = uncachedModules.length > 0
      ? await pool.processModules(uncachedModules, moduleConfig)
      : [];
    const results = [...cachedResults, ...workerResults];
    const writtenCount = cache ? writeSuccessfulResultsToCache(workerResults, cache, catalogueRevision) : 0;
    if (prunedCount > 0 || writtenCount > 0) {
      await cache.flush();
      logger.info(`Cache: ${prunedCount} pruned, ${writtenCount} written`);
    }
    const resultsById = new Map(results.map(result => [result.id, result]));
    const mergedModules = modules.map((module) => {
      const result = resultsById.get(module.id);
      if (!result) {
        return {
          ...module,
          issues: [...module.issues || []],
          status: "failed",
          failurePhase: "pipeline",
          error: "No worker result available for module"
        };
      }

      return {
        ...module,
        ...result,
        issues: [...result.issues || module.issues || []]
      };
    });
    const stage5Modules = mergedModules.map(toStage5Module);
    const stage5Path = await writePipelineOutputs(stage5Modules, PROJECT_ROOT);
    const duration = Date.now() - startTime;
    const avgTime = Math.round(duration / results.length);
    const successCount = results.filter(result => result.status === "success").length;
    const failedCount = results.filter(result => result.status === "failed").length;
    const skippedCount = results.filter(result => result.status === "skipped").length;
    const cachedCount = results.filter(result => result.fromCache).length;

    logger.info("\n========== Processing Complete ==========");
    logger.info(`Total modules: ${results.length}`);
    logger.info(`Success: ${successCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);
    logger.info(`Cached: ${cachedCount} (${Math.round(cachedCount / results.length * 100)}%)`);
    logger.info(`Total time: ${(duration / 1000).toFixed(1)}s`);
    logger.info(`Average: ${avgTime}ms per module`);
    logger.info(`Output: ${stage5Path}`);

    if (failedCount > 0) {
      logger.warn(`\n${failedCount} modules failed - check logs for details`);
    }
  }
  catch (error) {
    logger.error("Fatal error:", error);
    process.exit(1);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const isMainEntry = Boolean(process.argv[1]) && resolve(process.argv[1]) === currentFile;

if (isMainEntry) {
  main();
}
