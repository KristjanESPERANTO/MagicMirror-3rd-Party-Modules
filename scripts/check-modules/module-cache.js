// @ts-nocheck
/**
 * Module-level result caching for incremental checking
 *
 * This cache stores analysis results per module, keyed by:
 * - Module repository git SHA (last commit)
 * - 3rd-Party-Modules repository git SHA (this repo's HEAD)
 *
 * When both SHAs haven't changed since the last run, we can reuse
 * the cached analysis result instead of re-running all checks.
 */

import {createLogger} from "../shared/logger.js";
import {execFile} from "node:child_process";
import fs from "node:fs";
import {getRemoteCommitSha} from "./remote-sha.js";
import {promisify} from "node:util";


const execFileAsync = promisify(execFile);
const logger = createLogger().child?.("module-cache") ?? createLogger();

/**
 * @typedef {Object} ModuleCacheEntry
 * @property {string} moduleId - Module ID (e.g., "owner/repo")
 * @property {string | null} moduleSha - Git SHA of the module repository at time of caching
 * @property {string} catalogueSha - Git SHA of the 3rd-party-modules repository at time of caching
 * @property {string} cachedAt - Timestamp when this entry was cached
 * @property {Object} result - Cached analysis result for this module
 * @property {unknown[]} result.issues
 * @property {unknown[]} result.recommendations
 * @property {boolean} result.hasImage
 */

/**
 * @typedef {Object} ModuleCache
 * @property {string} version - Cache format version for future migrations
 * @property {string} catalogueSha - Git SHA of catalogue repo when cache was last updated
 * @property {string} lastUpdate - Timestamp of last cache update
 * @property {Record<string, ModuleCacheEntry>} entries - Cached entries keyed by module ID
 */

/**
 * Get the current git SHA of a repository
 * @param {string} repoPath
 * @returns {Promise<string | null>}
 */
async function getGitSha (repoPath) {
  try {
    const {stdout} = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return stdout.trim();
  } catch (error) {
    logger.warn(`Failed to get git SHA for ${repoPath}: ${
      error instanceof Error ? error.message : String(error)
    }`);
    return null;
  }
}

/**
 * Get module's commit SHA - tries API first (fast), falls back to git clone
 * @param {Object} module - Module metadata
 * @param {string} module.url - Repository URL
 * @param {string} moduleDir - Path to cloned module (if already cloned)
 * @returns {Promise<string | null>}
 */
export async function getModuleSha (module, moduleDir) {
  // Strategy 1: Try API first (fast, no cloning needed)
  if (module.url) {
    const remoteSha = await getRemoteCommitSha(module.url, "master");
    if (remoteSha) {
      logger.debug(`Got SHA for ${module.id} via API: ${remoteSha.slice(0, 8)}...`);
      return remoteSha;
    }
  }

  // Strategy 2: Fall back to local git (requires module to be cloned)
  if (moduleDir && fs.existsSync(moduleDir)) {
    const localSha = await getGitSha(moduleDir);
    if (localSha) {
      logger.debug(`Got SHA for ${module.id} via local git: ${localSha.slice(0, 8)}...`);
      return localSha;
    }
  }

  // Cannot determine SHA (module not cloned yet, API unavailable)
  return null;
}

/**
 * Load the module cache from disk
 * @param {string} cachePath
 * @returns {Promise<ModuleCache>}
 */
export async function loadModuleCache (cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      logger.info("No existing module cache found, starting fresh");
      return createEmptyCache();
    }

    const raw = await fs.promises.readFile(cachePath, "utf8");
    const cache = JSON.parse(raw);

    // Validate cache structure
    if (!cache.version || !cache.entries || typeof cache.entries !== "object") {
      logger.warn("Invalid cache structure, starting fresh");
      return createEmptyCache();
    }

    logger.info(`Loaded module cache with ${Object.keys(cache.entries).length} entries`);
    return cache;
  } catch (error) {
    logger.warn(`Failed to load module cache: ${
      error instanceof Error ? error.message : String(error)
    }`);
    return createEmptyCache();
  }
}

/**
 * Save the module cache to disk
 * @param {string} cachePath
 * @param {ModuleCache} cache
 * @returns {Promise<void>}
 */
export async function saveModuleCache (cachePath, cache) {
  try {
    await fs.promises.writeFile(
      cachePath,
      JSON.stringify(cache, null, 2),
      "utf8"
    );
    logger.info(`Saved module cache with ${Object.keys(cache.entries).length} entries`);
  } catch (error) {
    logger.error(`Failed to save module cache: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

/**
 * Check if a module's cached result is still valid
 * @param {Object} module - Module metadata
 * @param {string} module.id - Module ID
 * @param {string} module.url - Repository URL
 * @param {string} moduleDir - Path to cloned module (may not exist yet)
 * @param {string} catalogueRoot - Path to 3rd-party-modules repository
 * @param {ModuleCache} cache - Cache object
 * @returns {Promise<boolean>}
 */
export async function isCacheValid (module, moduleDir, catalogueRoot, cache) {
  const entry = cache.entries[module.id];
  if (!entry) {
    return false;
  }

  // Check if catalogue (3rd-party-modules repo) has changed
  const currentCatalogueSha = await getGitSha(catalogueRoot);
  if (!currentCatalogueSha || currentCatalogueSha !== entry.catalogueSha) {
    return false;
  }

  // Check if module repository has changed
  const currentModuleSha = await getModuleSha(module, moduleDir);
  if (!currentModuleSha || currentModuleSha !== entry.moduleSha) {
    return false;
  }

  // Both SHAs match - cache is valid!
  return true;
}

/**
 * Get cached result for a module (if valid)
 * @param {Object} module - Module metadata
 * @param {string} moduleDir - Path to cloned module (may not exist yet)
 * @param {string} catalogueRoot - Path to 3rd-party-modules repository
 * @param {ModuleCache} cache - Cache object
 * @returns {Promise<Object | null>}
 */
export async function getCachedResult (module, moduleDir, catalogueRoot, cache) {
  const valid = await isCacheValid(module, moduleDir, catalogueRoot, cache);
  if (!valid) {
    return null;
  }

  const entry = cache.entries[module.id];
  return entry?.result ?? null;
}

/**
 * Store a module's analysis result in the cache
 * @param {Object} module - Module metadata
 * @param {string} moduleDir - Path to cloned module
 * @param {string} catalogueRoot - Path to 3rd-party-modules repository
 * @param {Object} result - Analysis result to cache
 * @param {ModuleCache} cache - Cache object
 * @returns {Promise<void>}
 */
export async function setCachedResult (module, moduleDir, catalogueRoot, result, cache) {
  const moduleSha = await getModuleSha(module, moduleDir);
  const catalogueSha = await getGitSha(catalogueRoot);

  if (!catalogueSha) {
    logger.warn(`Cannot cache result for ${module.id}: catalogue SHA unavailable`);
    return;
  }

  cache.entries[module.id] = {
    moduleId: module.id,
    moduleSha,
    catalogueSha,
    cachedAt: new Date().toISOString(),
    result
  };

  // Update cache-level metadata
  cache.catalogueSha = catalogueSha;
  cache.lastUpdate = new Date().toISOString();
}

/**
 * Create an empty cache structure
 * @returns {ModuleCache}
 */
function createEmptyCache () {
  return {
    version: "1.0.0",
    catalogueSha: "",
    lastUpdate: new Date().toISOString(),
    entries: {}
  };
}

/**
 * Prune old cache entries (e.g., modules no longer in the catalogue)
 * @param {ModuleCache} cache
 * @param {string[]} activeModuleIds
 * @returns {number}
 */
export function pruneCacheEntries (cache, activeModuleIds) {
  const activeSet = new Set(activeModuleIds);
  const entriesBefore = Object.keys(cache.entries).length;

  for (const moduleId of Object.keys(cache.entries)) {
    if (!activeSet.has(moduleId)) {
      delete cache.entries[moduleId];
    }
  }

  const entriesAfter = Object.keys(cache.entries).length;
  const pruned = entriesBefore - entriesAfter;

  if (pruned > 0) {
    logger.info(`Pruned ${pruned} stale cache entries`);
  }

  return pruned;
}
