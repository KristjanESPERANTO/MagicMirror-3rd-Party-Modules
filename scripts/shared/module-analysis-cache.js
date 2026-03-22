import { createPersistentCache } from "./persistent-cache.js";
import { getCurrentCommit } from "./git.js";
import { resolve } from "node:path";
import { stringifyDeterministic } from "./deterministic-output.ts";

export const MODULE_ANALYSIS_CACHE_SCHEMA_VERSION = 2;
export const MODULE_ANALYSIS_CACHE_RELATIVE_PATH = "website/data/moduleCache.json";

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeModuleAnalysisCheckGroups(checkGroups = {}) {
  return {
    fast: Boolean(checkGroups.fast),
    deep: Boolean(checkGroups.deep),
    eslint: Boolean(checkGroups.eslint),
    ncu: Boolean(checkGroups.ncu)
  };
}

export function resolveModuleAnalysisCachePath(projectRoot) {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new TypeError("resolveModuleAnalysisCachePath requires a non-empty projectRoot");
  }

  return resolve(projectRoot, MODULE_ANALYSIS_CACHE_RELATIVE_PATH);
}

export async function getProjectRevision(projectRoot) {
  try {
    return await getCurrentCommit({ cwd: projectRoot });
  }
  catch {
    return null;
  }
}

export function buildModuleAnalysisCacheContract({ module, moduleRevision, catalogueRevision, checkGroups } = {}) {
  const moduleId = normalizeOptionalString(module?.id);
  const moduleUrl = normalizeOptionalString(module?.url);
  const moduleBranch = normalizeOptionalString(module?.branch);
  const normalizedModuleRevision = normalizeOptionalString(moduleRevision ?? module?.lastCommit);
  const normalizedCatalogueRevision = normalizeOptionalString(catalogueRevision);

  if (!moduleId || !moduleUrl || !normalizedModuleRevision || !normalizedCatalogueRevision) {
    return null;
  }

  return {
    schemaVersion: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
    module: {
      id: moduleId,
      url: moduleUrl,
      branch: moduleBranch
    },
    repoFreshness: {
      moduleRevision: normalizedModuleRevision,
      catalogueRevision: normalizedCatalogueRevision
    },
    analysisConfig: normalizeModuleAnalysisCheckGroups(checkGroups)
  };
}

export function buildModuleAnalysisCacheKey(options = {}) {
  const contract = buildModuleAnalysisCacheContract(options);
  if (!contract) {
    return null;
  }

  return stringifyDeterministic(contract, 0);
}

export function createModuleAnalysisCache({ filePath, defaultTtlMs = 0, now } = {}) {
  return createPersistentCache({
    filePath,
    version: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
    defaultTtlMs,
    now
  });
}
