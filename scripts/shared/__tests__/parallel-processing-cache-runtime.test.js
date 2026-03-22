import {
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache,
  normalizeModuleAnalysisCheckGroups
} from "../../shared/module-analysis-cache.ts";
import { deepEqual, equal, ok } from "node:assert/strict";
import {
  partitionModulesByCache,
  pruneStaleCacheEntries,
  runParallelProcessing,
  writeSuccessfulResultsToCache
} from "../../parallel-processing.ts";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";

const DEFAULT_ANALYSIS_CONFIG = normalizeModuleAnalysisCheckGroups({
  fast: true,
  deep: true,
  eslint: true,
  ncu: true
});

async function createTempCachePath(prefix = "parallel-cache-runtime-test-") {
  const directoryPath = await mkdtemp(join(tmpdir(), prefix));
  return join(directoryPath, "moduleCache.json");
}

function createModule({ id, url, lastCommit }) {
  return {
    id,
    url,
    lastCommit,
    name: id,
    maintainer: "maintainer",
    issues: []
  };
}

function createSilentLogger() {
  return {
    error: () => null,
    info: () => null,
    warn: () => null
  };
}

test("partitionModulesByCache splits cache hits and misses with skipped semantics", async () => {
  const catalogueRevision = "catalogue-rev-1";
  const modules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" })
  ];

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const cacheKey = buildModuleAnalysisCacheKey({
    module: modules[0],
    catalogueRevision,
    checkGroups: DEFAULT_ANALYSIS_CONFIG
  });
  ok(cacheKey, "expected cache key for first module");

  cache.set(cacheKey, {
    id: modules[0].id,
    name: modules[0].name,
    maintainer: modules[0].maintainer,
    url: modules[0].url,
    issues: []
  });

  const { cachedResults, uncachedModules } = partitionModulesByCache(modules, {
    cache,
    catalogueRevision,
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  equal(cachedResults.length, 1);
  equal(uncachedModules.length, 1);
  equal(cachedResults[0].id, modules[0].id);
  equal(cachedResults[0].status, "skipped");
  equal(cachedResults[0].skippedReason, "cached");
  equal(cachedResults[0].fromCache, true);
  equal(uncachedModules[0].id, modules[1].id);
});

test("pruneStaleCacheEntries removes orphaned and invalidated keys", async () => {
  const catalogueRevision = "catalogue-rev-2";
  const analysisConfig = DEFAULT_ANALYSIS_CONFIG;

  const currentModules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a-new" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" })
  ];

  const staleRevisionModule = createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a-old" });
  const removedModule = createModule({ id: "owner/module-c", url: "https://github.com/owner/module-c", lastCommit: "sha-c" });

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const staleRevisionKey = buildModuleAnalysisCacheKey({
    module: staleRevisionModule,
    catalogueRevision,
    checkGroups: analysisConfig
  });
  const keptKey = buildModuleAnalysisCacheKey({
    module: currentModules[1],
    catalogueRevision,
    checkGroups: analysisConfig
  });
  const removedModuleKey = buildModuleAnalysisCacheKey({
    module: removedModule,
    catalogueRevision,
    checkGroups: analysisConfig
  });

  ok(staleRevisionKey);
  ok(keptKey);
  ok(removedModuleKey);

  cache.set(staleRevisionKey, { id: staleRevisionModule.id, status: "success" });
  cache.set(keptKey, { id: currentModules[1].id, status: "success" });
  cache.set(removedModuleKey, { id: removedModule.id, status: "success" });

  const prunedCount = pruneStaleCacheEntries(cache, currentModules, {
    catalogueRevision,
    analysisConfig
  });

  equal(prunedCount, 2);
  deepEqual(cache.getAllKeys(), [keptKey]);
});

test("integration: second run has higher cache skip-rate", async () => {
  const catalogueRevision = "catalogue-rev-3";
  const modules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" }),
    createModule({ id: "owner/module-c", url: "https://github.com/owner/module-c", lastCommit: "sha-c" })
  ];

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const firstRun = partitionModulesByCache(modules, {
    cache,
    catalogueRevision,
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  equal(firstRun.cachedResults.length, 0);
  equal(firstRun.uncachedModules.length, modules.length);

  const workerResults = firstRun.uncachedModules.map((module) => {
    const cacheKey = buildModuleAnalysisCacheKey({
      module,
      catalogueRevision,
      checkGroups: DEFAULT_ANALYSIS_CONFIG
    });

    return {
      id: module.id,
      name: module.name,
      maintainer: module.maintainer,
      url: module.url,
      issues: [],
      status: "success",
      cacheKey,
      fromCache: false
    };
  });

  const writtenCount = writeSuccessfulResultsToCache(workerResults, cache, catalogueRevision);
  equal(writtenCount, modules.length);
  await cache.flush();

  const secondRun = partitionModulesByCache(modules, {
    cache,
    catalogueRevision,
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  const firstRunSkipRate = firstRun.cachedResults.length / modules.length;
  const secondRunSkipRate = secondRun.cachedResults.length / modules.length;

  equal(secondRun.uncachedModules.length, 0);
  equal(secondRunSkipRate, 1);
  ok(secondRunSkipRate > firstRunSkipRate);
});

test("runParallelProcessing processes in-memory modules independently of CLI file loading", async () => {
  const modules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" })
  ];

  let capturedModules = null;
  let capturedModuleConfig = null;
  let progressHandler = null;

  const workerPool = {
    onProgress(handler) {
      progressHandler = handler;
    },
    processModules(uncachedModules, moduleConfig) {
      capturedModules = uncachedModules;
      capturedModuleConfig = moduleConfig;

      for (const module of uncachedModules) {
        progressHandler?.({
          type: "module",
          status: "success",
          moduleId: module.id,
          fromCache: false
        });
      }

      return uncachedModules.map(module => ({
        ...module,
        status: "success",
        fromCache: false,
        issues: [...module.issues]
      }));
    }
  };

  const result = await runParallelProcessing({
    modules,
    projectRoot: "/virtual/project",
    workerCount: 1,
    batchSize: modules.length,
    cacheDisabled: true,
    catalogueRevision: "catalogue-rev-runtime-test",
    workerPool,
    runLogger: createSilentLogger()
  });

  deepEqual(capturedModules, modules);
  equal(capturedModuleConfig.projectRoot, "/virtual/project");
  equal(capturedModuleConfig.cacheEnabled, false);
  equal(capturedModuleConfig.catalogueRevision, "catalogue-rev-runtime-test");
  equal(result.results.length, modules.length);
  equal(result.stage5Modules.length, modules.length);
  equal(result.successCount, modules.length);
  equal(result.failedCount, 0);
  equal(result.skippedCount, 0);
  equal(result.cachedCount, 0);
});
