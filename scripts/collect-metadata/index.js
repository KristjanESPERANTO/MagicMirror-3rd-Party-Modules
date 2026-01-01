/**
 * Unified Metadata Collector (Stage 1+2)
 *
 * This script combines the logic of creating the module list from the Wiki (Stage 1)
 * and enriching it with repository metadata (Stage 2) into a single pass.
 *
 * Roadmap: P6.1
 */

import {fetchRepositoryData, normalizeRepositoryData} from "../updateRepositoryApiData/api.js";
import {getRepositoryId, getRepositoryType} from "../updateRepositoryApiData/helpers.js";
import {createHttpClient} from "../shared/http-client.js";
import {createLogger} from "../shared/logger.js";
import {createPersistentCache} from "../shared/persistent-cache.js";
import {createRateLimiter} from "../shared/rate-limiter.js";
import fs from "node:fs";
import {loadPreviousModules} from "../shared/module-list.js";
import {parseModuleList} from "./parser.js";
import path from "node:path";
import process from "node:process";

const logger = createLogger({name: "collect-metadata"});

// Configuration
const WIKI_URL = "https://raw.githubusercontent.com/wiki/MagicMirrorOrg/MagicMirror/3rd-Party-Modules.md";
const REPOSITORY_CACHE_PATH = path.join("website", "data", "cache", "repository-api-cache.json");
const REPOSITORY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 1 day
const GITHUB_GRAPHQL_BATCH_SIZE = 100;
const FORCE_REFRESH = process.env.FORCE_REFRESH === "true";

// Initialize services
const rateLimiter = createRateLimiter({
  tokensPerInterval: 2,
  intervalMs: 1000
});

const httpClient = createHttpClient({rateLimiter});

const repositoryCache = createPersistentCache({
  filePath: REPOSITORY_CACHE_PATH,
  defaultTtlMs: REPOSITORY_CACHE_TTL_MS,
  version: "repository-api/v1"
});

/**
 * Fetch the raw Markdown content from the Wiki or a local file.
 */
async function fetchMarkdown () {
  if (process.env.WIKI_FILE) {
    logger.info(`Reading module list from local file: ${process.env.WIKI_FILE}`);
    return fs.readFileSync(process.env.WIKI_FILE, "utf8");
  }

  logger.info(`Fetching module list from Wiki: ${WIKI_URL}`);
  const result = await httpClient.getText(WIKI_URL);
  if (!result.ok) {
    throw new Error(`Failed to fetch Wiki: ${result.status} ${result.statusText}`);
  }
  return result.data;
}

/**
 * Fetch metadata for a batch of GitHub repositories using GraphQL.
 */
async function fetchGitHubBatch (modules) {
  if (modules.length === 0) {
    return {};
  }

  const repoFragments = [];
  const aliasMap = {};

  for (const [index, module] of modules.entries()) {
    const repoId = getRepositoryId(module.url);
    if (repoId) {
      const [owner, name] = repoId.split("/");
      const alias = `repo${index}`;
      aliasMap[alias] = module.url; // Map alias back to module URL

      repoFragments.push(`
        ${alias}: repository(owner: "${owner}", name: "${name}") {
          openIssues: issues(states: OPEN) { totalCount }
          stargazerCount
          isArchived
          isDisabled
          hasIssuesEnabled
          pushedAt
          licenseInfo { spdxId }
          defaultBranchRef {
            name
          }
        }
      `);
    }
  }

  const query = `query { ${repoFragments.join("\n")} }`;

  try {
    const response = await httpClient.postJson("https://api.github.com/graphql", {
      query
    }, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    });

    if (!response.ok) {
      logger.error(`GitHub GraphQL batch failed: ${response.status}`);
      return {};
    }

    const data = response.data.data;
    const results = {};

    for (const [alias, repoData] of Object.entries(data)) {
      if (repoData) {
        const url = aliasMap[alias];
        results[url] = repoData;
      }
    }

    return results;
  } catch (error) {
    logger.error("GitHub GraphQL batch error", {error: error.message});
    return {};
  }
}

/**
 * Helper to apply fallback data from previous run if available.
 */
function getFallbackOrOriginal (module, previousModulesMap) {
  const previousModule = previousModulesMap.get(module.url);
  if (previousModule) {
    return {
      ...module,
      stars: previousModule.stars,
      license: previousModule.license,
      hasGithubIssues: previousModule.hasGithubIssues,
      isArchived: previousModule.isArchived
    };
  }
  return module;
}

/**
 * Helper to fetch individual repository data.
 */
async function fetchIndividualModule (module, repoType, client) {
  try {
    const {response, data, branchData} = await fetchRepositoryData(module, client);

    if (response && !response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText || ""}`);
    }

    const normalized = normalizeRepositoryData(data, branchData, repoType);
    return {success: true, data: normalized};
  } catch (error) {
    return {success: false, error};
  }
}

/**
 * Process a single module: check cache, queue for batch, or fetch individually.
 * Returns the enriched module or null if queued for batch processing.
 */
async function processModule (module, context) {
  const {
    previousModulesMap,
    circuitBreaker,
    stats,
    githubModulesToFetch,
    client
  } = context;

  const repoId = getRepositoryId(module.url);
  const cachedEntry = repositoryCache.get(repoId);

  if (!FORCE_REFRESH && cachedEntry) {
    stats.hits += 1;
    if (cachedEntry.value.isFailed) {
      const fallback = getFallbackOrOriginal(module, previousModulesMap);
      if (fallback !== module) {
        stats.fallbacks += 1;
      }
      return fallback;
    }
    return {
      ...module,
      ...cachedEntry.value
    };
  }

  stats.misses += 1;

  if (circuitBreaker.stopFetching) {
    const fallback = getFallbackOrOriginal(module, previousModulesMap);
    if (fallback !== module) {
      stats.fallbacks += 1;
    }
    return fallback;
  }

  const repoType = getRepositoryType(module.url);
  if (repoType === "github" && process.env.GITHUB_TOKEN) {
    githubModulesToFetch.push(module);
    return null;
  }

  // Fetch individual (non-GitHub or no token)
  const {success, data, error} = await fetchIndividualModule(module, repoType, client);

  if (success) {
    circuitBreaker.recordSuccess();
    repositoryCache.set(repoId, data);
    return {
      ...module,
      ...data
    };
  }

  logger.warn(`Failed to fetch metadata for ${module.name}`, {url: module.url, error: error.message});
  circuitBreaker.recordError(error);

  if (!circuitBreaker.stopFetching) {
    logger.info(`Using fallback data for ${module.name}`);
  }

  const fallback = getFallbackOrOriginal(module, previousModulesMap);
  if (fallback !== module) {
    stats.fallbacks += 1;
  }

  // Cache negative result
  repositoryCache.set(repoId, {isFailed: true, error: error.message}, NEGATIVE_CACHE_TTL_MS);
  stats.errors += 1;
  return fallback;
}

/**
 * Enrich the module list with repository metadata.
 */
async function enrichModules (modules, previousModulesMap) {
  const enrichedModules = [];
  const githubModulesToFetch = [];
  const stats = {hits: 0, misses: 0, errors: 0, fallbacks: 0};
  let processedCount = 0;
  const totalModules = modules.length;

  const circuitBreaker = {
    consecutive403Errors: 0,
    stopFetching: false,
    recordError (error) {
      if (error.message.includes("403")) {
        this.consecutive403Errors += 1;
        if (this.consecutive403Errors >= 5) {
          logger.warn("Rate limit hit (403) multiple times. Stopping further API requests and using fallback data.");
          this.stopFetching = true;
        }
      } else {
        this.consecutive403Errors = 0;
      }
    },
    recordSuccess () {
      this.consecutive403Errors = 0;
    }
  };

  const context = {
    previousModulesMap,
    circuitBreaker,
    stats,
    githubModulesToFetch,
    client: httpClient
  };

  /*
   * 1. Check cache and separate GitHub modules for batching
   */
  for (const module of modules) {
    processedCount += 1;
    if (processedCount % 50 === 0) {
      logger.info(`Processed ${processedCount}/${totalModules} modules (Cache/Pre-sort)...`);
    }

    const result = await processModule(module, context);
    if (result) {
      enrichedModules.push(result);
    }
  }

  // 2. Batch fetch GitHub modules
  if (githubModulesToFetch.length > 0) {
    logger.info(`Batch fetching ${githubModulesToFetch.length} GitHub repositories...`);
    // Split into chunks
    for (let index = 0; index < githubModulesToFetch.length; index += GITHUB_GRAPHQL_BATCH_SIZE) {
      const chunk = githubModulesToFetch.slice(index, index + GITHUB_GRAPHQL_BATCH_SIZE);
      const batchResults = await fetchGitHubBatch(chunk);

      for (const module of chunk) {
        const repoData = batchResults[module.url];
        const repoId = getRepositoryId(module.url);

        if (repoData) {
          const normalized = normalizeRepositoryData(repoData, null, "github");

          repositoryCache.set(repoId, normalized);
          enrichedModules.push({
            ...module,
            ...normalized
          });
        } else {
          logger.warn(`No data returned for ${module.name} in batch`, {url: module.url});

          const fallback = getFallbackOrOriginal(module, previousModulesMap);
          if (fallback !== module) {
            logger.info(`Using fallback data for ${module.name} (batch failure)`);
            stats.fallbacks += 1;
          }
          enrichedModules.push(fallback);

          // Cache negative result
          repositoryCache.set(repoId, {isFailed: true, error: "Not found in GraphQL batch"}, NEGATIVE_CACHE_TTL_MS);
          stats.errors += 1;
        }
      }
    }
  }

  logger.info("Metadata collection stats", stats);
  return enrichedModules;
}

async function main () {
  try {
    logger.info("Starting unified metadata collection...");

    if (!process.env.GITHUB_TOKEN) {
      logger.warn("GITHUB_TOKEN is not set. Rate limits will be strict and processing may be slow.");
    }

    const markdown = await fetchMarkdown();
    const {modules} = parseModuleList(markdown);
    logger.info(`Parsed ${modules.length} modules from Wiki.`);

    const previousModulesMap = loadPreviousModules();
    const enrichedModules = await enrichModules(modules, previousModulesMap);

    const outputPath = path.join("website", "data", "modules.stage.2.json");
    fs.writeFileSync(outputPath, JSON.stringify(enrichedModules, null, 2));
    logger.info(`Successfully wrote ${enrichedModules.length} modules to ${outputPath}`);
  } catch (error) {
    logger.error("Metadata collection failed", {error: error.message});
    process.exit(1);
  }
}

main();
