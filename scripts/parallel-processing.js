#!/usr/bin/env node
/**
 * Parallel Module Processing Stage (P7.3)
 *
 * Replaces stages 3+4+5 with parallel worker pool processing.
 * CLI wrapper reads modules.stage.2.json and writes modules.stage.5.json.
 */

import {
  MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache,
  getProjectRevision,
  normalizeModuleAnalysisCheckGroups,
  resolveModuleAnalysisCachePath
} from "../scripts/shared/module-analysis-cache.js";
import { toStage5Module, writePipelineOutputs } from "../scripts/shared/module-catalogue-output.js";
import { WorkerPool } from "../pipeline/workers/worker-pool.js";
import { cpus } from "node:os";
import { createLogger } from "../scripts/shared/logger.js";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const logger = createLogger({ name: "parallel-processing" });
const PROJECT_ROOT = resolve(process.cwd());
const DEFAULT_ANALYSIS_CONFIG = normalizeModuleAnalysisCheckGroups({
  fast: true,
  deep: true,
  eslint: true,
  ncu: true
});

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

function createWorkerPool(workerCount, batchSize) {
  return new WorkerPool({
    workerCount,
    batchSize,
    moduleTimeoutMs: 60000,
    batchTimeoutMs: 1800000
  });
}

function buildMergedModules(modules, results) {
  const resultsById = new Map(results.map(result => [result.id, result]));

  return modules.map((module) => {
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
}

function summarizeResults(results, durationMs) {
  const successCount = results.filter(result => result.status === "success").length;
  const failedCount = results.filter(result => result.status === "failed").length;
  const skippedCount = results.filter(result => result.status === "skipped").length;
  const cachedCount = results.filter(result => result.fromCache).length;

  return {
    averageProcessingTimeMs: results.length > 0 ? Math.round(durationMs / results.length) : 0,
    cachedCount,
    cachedPercentage: results.length > 0 ? Math.round(cachedCount / results.length * 100) : 0,
    failedCount,
    skippedCount,
    successCount
  };
}

function logProcessingSummary(results, durationMs, stage5Path, runLogger) {
  const summary = summarizeResults(results, durationMs);

  runLogger.info("\n========== Processing Complete ==========");
  runLogger.info(`Total modules: ${results.length}`);
  runLogger.info(`Success: ${summary.successCount} | Failed: ${summary.failedCount} | Skipped: ${summary.skippedCount}`);
  runLogger.info(`Cached: ${summary.cachedCount} (${summary.cachedPercentage}%)`);
  runLogger.info(`Total time: ${(durationMs / 1000).toFixed(1)}s`);
  runLogger.info(`Average: ${summary.averageProcessingTimeMs}ms per module`);

  if (stage5Path) {
    runLogger.info(`Output: ${stage5Path}`);
  }

  if (summary.failedCount > 0) {
    runLogger.warn(`\n${summary.failedCount} modules failed - check logs for details`);
  }

  return summary;
}

/**
 * Run the parallel-processing stage against an in-memory Stage 2 module list.
 *
 * @param {object} options
 * @param {Array} options.modules Stage 2 modules to process
 * @param {string} [options.projectRoot] Project root for path resolution
 * @param {number} [options.workerCount] Worker count override
 * @param {number} [options.batchSize] Batch size override
 * @param {boolean} [options.cacheDisabled] Disable cache read/write behavior
 * @param {object} [options.analysisConfig] Check-group configuration
 * @param {string|null} [options.catalogueRevision] Catalogue revision override
 * @param {object|null} [options.workerPool] Injected worker pool for tests/future orchestrator wiring
 * @param {Function|null} [options.outputWriter] Output writer override; use null to skip writes
 * @param {object} [options.runLogger] Logger implementation
 * @returns {Promise<object>} Summary, results, and generated stage5 modules
 */
export async function runParallelProcessing({
  modules,
  projectRoot = PROJECT_ROOT,
  workerCount = getWorkerCount(),
  batchSize = getBatchSize(),
  cacheDisabled = isCacheDisabled(),
  analysisConfig = DEFAULT_ANALYSIS_CONFIG,
  catalogueRevision,
  workerPool = null,
  outputWriter = writePipelineOutputs,
  runLogger = logger
} = {}) {
  if (!Array.isArray(modules)) {
    throw new TypeError("runParallelProcessing requires a modules array");
  }

  const startTime = Date.now();
  const pool = workerPool ?? createWorkerPool(workerCount, batchSize);
  const normalizedAnalysisConfig = normalizeModuleAnalysisCheckGroups(analysisConfig);

  runLogger.info(`Loaded ${modules.length} modules`);
  runLogger.info(`Starting parallel processing with ${workerCount} workers, batch size ${batchSize}`);

  if (cacheDisabled) {
    runLogger.warn("Cache disabled (--no-cache / PIPELINE_CACHE_DISABLED): all modules will be processed fresh");
  }

  let processedCount = 0;
  if (typeof pool.onProgress === "function") {
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
        runLogger.info(`[${processedCount}/${modules.length}] ${status} ${event.moduleId}${cacheInfo}`);
      }
    });
  }

  const resolvedCatalogueRevision = typeof catalogueRevision === "undefined"
    ? await getProjectRevision(projectRoot)
    : catalogueRevision;

  if (!resolvedCatalogueRevision) {
    runLogger.warn("Could not resolve current catalogue revision; module cache keys will be unavailable for this run");
  }

  const cachePath = resolveModuleAnalysisCachePath(projectRoot);
  let cache = null;
  let prunedCount = 0;
  let cachedResults = [];
  let uncachedModules = modules;

  if (!cacheDisabled) {
    cache = createModuleAnalysisCache({ filePath: cachePath });
    await cache.load();
    prunedCount = pruneStaleCacheEntries(cache, modules, {
      catalogueRevision: resolvedCatalogueRevision,
      analysisConfig: normalizedAnalysisConfig
    });
    ({ cachedResults, uncachedModules } = partitionModulesByCache(modules, {
      cache,
      catalogueRevision: resolvedCatalogueRevision,
      analysisConfig: normalizedAnalysisConfig
    }));

    if (cachedResults.length > 0) {
      for (const result of cachedResults) {
        processedCount += 1;
        runLogger.info(`[${processedCount}/${modules.length}] ⊙ ${result.id} (cached)`);
      }
      runLogger.info(`Cache: ${cachedResults.length} hit(s), ${uncachedModules.length} to process`);
    }
  }

  const moduleConfig = {
    projectRoot,
    modulesDir: resolve(projectRoot, "modules"),
    modulesTempDir: resolve(projectRoot, "modules_temp"),
    imagesDir: resolve(projectRoot, "website/images"),
    cacheEnabled: !cacheDisabled,
    cachePath,
    cacheSchemaVersion: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
    catalogueRevision: resolvedCatalogueRevision,
    analysisConfig: normalizedAnalysisConfig,
    checkGroups: normalizedAnalysisConfig,
    timeoutMs: 60000
  };
  const workerResults = uncachedModules.length > 0
    ? await pool.processModules(uncachedModules, moduleConfig)
    : [];
  const results = [...cachedResults, ...workerResults];
  const writtenCount = cache
    ? writeSuccessfulResultsToCache(workerResults, cache, resolvedCatalogueRevision)
    : 0;

  if (prunedCount > 0 || writtenCount > 0) {
    await cache.flush();
    runLogger.info(`Cache: ${prunedCount} pruned, ${writtenCount} written`);
  }

  const mergedModules = buildMergedModules(modules, results);
  const stage5Modules = mergedModules.map(toStage5Module);
  const stage5Path = outputWriter ? await outputWriter(stage5Modules, projectRoot) : null;
  const durationMs = Date.now() - startTime;
  const summary = logProcessingSummary(results, durationMs, stage5Path, runLogger);

  return {
    ...summary,
    durationMs,
    results,
    stage5Modules,
    stage5Path
  };
}

async function main() {
  const stage2Path = resolve(PROJECT_ROOT, "website/data/modules.stage.2.json");

  try {
    logger.info(`Reading modules from ${stage2Path}...`);
    const modules = JSON.parse(await readFile(stage2Path, "utf-8"));
    await runParallelProcessing({ modules, projectRoot: PROJECT_ROOT });
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
