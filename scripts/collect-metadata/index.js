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
import {parseModuleList} from "./parser.js";
import path from "node:path";
import process from "node:process";

const logger = createLogger({name: "collect-metadata"});

// Configuration
const WIKI_URL = "https://raw.githubusercontent.com/wiki/MagicMirrorOrg/MagicMirror/3rd-Party-Modules.md";
const REPOSITORY_CACHE_PATH = path.join("website", "data", "cache", "repository-api-cache.json");
const REPOSITORY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const GITHUB_GRAPHQL_BATCH_SIZE = 100;

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
 * Enrich the module list with repository metadata.
 */
async function enrichModules (modules) {
  const enrichedModules = [];
  const githubModulesToFetch = [];

  /*
   * 1. Check cache and separate GitHub modules for batching
   * 1. Check cache and separate GitHub modules for batching
   */
  for (const module of modules) {
    const repoId = getRepositoryId(module.url);
    const cachedEntry = repositoryCache.get(repoId);
    if (cachedEntry) {
      enrichedModules.push({
        ...module,
        ...cachedEntry.value
      });
    } else {
      const repoType = getRepositoryType(module.url);
      if (repoType === "github" && process.env.GITHUB_TOKEN) {
        githubModulesToFetch.push(module);
      } else {
        // Fetch individual (non-GitHub or no token)
        try {
          const {data, branchData} = await fetchRepositoryData(module, httpClient);
          const normalized = normalizeRepositoryData(data, branchData, repoType);

          repositoryCache.set(repoId, normalized);
          enrichedModules.push({
            ...module,
            ...normalized
          });
        } catch (error) {
          logger.warn(`Failed to fetch metadata for ${module.name}`, {url: module.url, error: error.message});
          enrichedModules.push(module); // Keep original without metadata
        }
      }
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
        if (repoData) {
          const normalized = normalizeRepositoryData(repoData, null, "github");
          const repoId = getRepositoryId(module.url);

          repositoryCache.set(repoId, normalized);
          enrichedModules.push({
            ...module,
            ...normalized
          });
        } else {
          logger.warn(`No data returned for ${module.name} in batch`, {url: module.url});
          enrichedModules.push(module);
        }
      }
    }
  }

  return enrichedModules;
}

async function main () {
  try {
    logger.info("Starting unified metadata collection...");

    // 1. Fetch & Parse
    await repositoryCache.load();
    const markdown = await fetchMarkdown();
    const {modules, issues} = parseModuleList(markdown);

    logger.info(`Parsed ${modules.length} modules from Wiki.`);
    if (issues.length > 0) {
      logger.warn(`Encountered ${issues.length} issues during parsing.`, {issues});
    }

    // 2. Enrich
    const enrichedModules = await enrichModules(modules);

    // 3. Output
    const outputPath = path.join("website", "data", "modules.stage.2.json"); // Overwrite Stage 2 output directly
    fs.writeFileSync(outputPath, JSON.stringify(enrichedModules, null, 2));

    await repositoryCache.flush();
    logger.info(`Successfully wrote ${enrichedModules.length} modules to ${outputPath}`);
  } catch (error) {
    logger.error("Metadata collection failed", {error: error.message, stack: error.stack});
    process.exit(1);
  }
}

main();
