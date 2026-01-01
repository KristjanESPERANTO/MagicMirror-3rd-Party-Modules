/*
 * This script refreshes the public metadata for every third-party module each day
 * (stars, recent updates, archived status, …) and writes the results into the website
 * JSON files. It keeps successful API responses in a small cache so we avoid redundant
 * requests and stay within GitHub rate limits. If a request fails, the script falls back
 * to the most recent known values so the published dataset remains complete.
 */
import {
  applyRepositoryData,
  createRepositoryDataRecord,
  getRepositoryId,
  getRepositoryType,
  loadPreviousData,
  partitionModules,
  sortByNameIgnoringPrefix,
  sortModuleListByLastUpdate,
  useHistoricalData
} from "./updateRepositoryApiData/helpers.js";
import {fetchRepositoryData, normalizeRepositoryData} from "./updateRepositoryApiData/api.js";
import {createHttpClient} from "./shared/http-client.js";
import {createLogger} from "./shared/logger.js";
import {createPersistentCache} from "./shared/persistent-cache.js";
import {createRateLimiter} from "./shared/rate-limiter.js";
import fs from "node:fs";
import {getJson} from "./utils.js";
import path from "node:path";
import process from "node:process";
import {validateStageData} from "./lib/schemaValidator.js";

const logger = createLogger({name: "update-repo-data"});

let queryCount = 0;
let maxQueryCount = 58;
let moduleCount = 0;

const GITHUB_GRAPHQL_BATCH_SIZE = 100;
// Keep repository API responses around for ~72 hours so daily pipeline runs reuse prior results.
const REPOSITORY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const REPOSITORY_CACHE_PATH = path.join(
  "website",
  "data",
  "cache",
  "repository-api-cache.json"
);
const repositoryCache = createPersistentCache({
  filePath: REPOSITORY_CACHE_PATH,
  defaultTtlMs: REPOSITORY_CACHE_TTL_MS,
  version: "repository-api/v1"
});

const rateLimiter = createRateLimiter({
  tokensPerInterval: 2, // Conservative limit
  intervalMs: 1000
});

const httpClient = createHttpClient({
  rateLimiter
});

function shouldFetch (repository) {
  const repoType = getRepositoryType(repository.url);
  return repoType !== "unknown" && maxQueryCount > 0 && (queryCount < maxQueryCount || process.env.GITHUB_TOKEN);
}

/*
 * Fetch multiple GitHub repositories in a single GraphQL request.
 * This reduces API calls from 2 per repo to ~0.01 per repo (100 repos per request).
 */
async function fetchGitHubBatch (modules, headers) {
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
      aliasMap[alias] = module.id;

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

  const query = `query {
    ${repoFragments.join("\n")}
  }`;

  const response = await httpClient.request("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({query})
  });

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
  const rateLimitCost = response.headers.get("x-ratelimit-cost");
  const rateLimitUsed = response.headers.get("x-ratelimit-used");
  const rateLimitReset = response.headers.get("x-ratelimit-reset");
  const rateLimitResetSeconds = rateLimitReset ? Number.parseInt(rateLimitReset, 10) : Number.NaN;
  const rateLimitResetIso = Number.isFinite(rateLimitResetSeconds)
    ? new Date(rateLimitResetSeconds * 1000).toISOString()
    : "unknown";
  if (rateLimitCost || rateLimitUsed || rateLimitRemaining) {
    logger.info("GitHub GraphQL rate limit:", {
      cost: rateLimitCost ?? "?",
      used: rateLimitUsed ?? "?",
      remaining: rateLimitRemaining ?? "?",
      resetsAt: rateLimitResetIso
    });
  }

  queryCount += 1;

  if (!response.ok) {
    if (response.status === 403) {
      const rateLimitInfo = response.headers.get("x-ratelimit-remaining");
      const resetTime = response.headers.get("x-ratelimit-reset");
      const resetDate = resetTime ? new Date(Number.parseInt(resetTime, 10) * 1000).toISOString() : "unknown";

      logger.warn("GitHub API rate limit exceeded (403).", {
        remaining: rateLimitInfo ?? "0",
        resetsAt: resetDate,
        tip: "Set GITHUB_TOKEN environment variable with a valid personal access token."
      });
    }
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    logger.error("GraphQL errors:", result.errors);
  }

  const normalized = {};

  for (const [alias, moduleId] of Object.entries(aliasMap)) {
    const repo = result.data?.[alias];
    if (repo) {
      normalized[moduleId] = {
        issues: repo.openIssues?.totalCount ?? 0,
        stars: repo.stargazerCount ?? 0,
        license: repo.licenseInfo?.spdxId ?? null,
        archived: repo.isArchived ?? false,
        disabled: repo.isDisabled ?? false,
        defaultBranch: repo.defaultBranchRef?.name ?? null,
        has_issues: repo.hasIssuesEnabled ?? true,
        lastCommit: repo.pushedAt ?? null
      };
    }
  }

  return normalized;
}

async function processGitHubModules (githubModules, headers, previousData, results, {cache, cacheKeys} = {}) {
  logger.info(`Fetching ${githubModules.length} GitHub repos via GraphQL (batches of ${GITHUB_GRAPHQL_BATCH_SIZE})...`);
  for (let index = 0; index < githubModules.length; index += GITHUB_GRAPHQL_BATCH_SIZE) {
    const batch = githubModules.slice(index, index + GITHUB_GRAPHQL_BATCH_SIZE);
    moduleCount += batch.length;

    try {
      const batchResults = await fetchGitHubBatch(batch, headers);

      for (const module of batch) {
        const normalizedRepositoryData = batchResults[module.id];

        if (normalizedRepositoryData) {
          const cacheKey = cacheKeys?.get(module.id);
          const cacheEntry = cacheKey
            ? cache?.set(cacheKey, normalizedRepositoryData, {
              ttlMs: REPOSITORY_CACHE_TTL_MS,
              metadata: {host: "github", strategy: "graphql"}
            })
            : null;

          applyRepositoryData(module, normalizedRepositoryData);
          const repositoryData = createRepositoryDataRecord({
            moduleId: module.id,
            normalizedData: normalizedRepositoryData,
            timestamp: cacheEntry?.updatedAt ?? new Date().toISOString()
          });
          results.push(repositoryData);
        } else {
          useHistoricalData(previousData, module.id, module, results);
        }
      }

      logger.info(`Processed ${Math.min(index + GITHUB_GRAPHQL_BATCH_SIZE, githubModules.length)}/${githubModules.length} GitHub repos`);
    } catch (error) {
      logger.error("Error fetching GitHub batch:", error.message);
      for (const module of batch) {
        useHistoricalData(previousData, module.id, module, results);
      }
    }
  }
}

async function updateData () {
  try {
    await repositoryCache.load();
    moduleCount = 0;

    const remoteFilePath = "https://modules.magicmirror.builders/data/gitHubData.json";
    const localFilePath = "website/data/gitHubData.json";
    const previousData = await loadPreviousData(remoteFilePath, localFilePath);

    const moduleListData = await getJson("./website/data/modules.stage.1.json");
    validateStageData("modules.stage.1", moduleListData);
    const moduleList = moduleListData.modules;
    const moduleListLength = moduleList.length;

    const results = [];

    sortModuleListByLastUpdate(previousData, moduleList);

    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // Group modules by hosting type, leveraging cache hits where possible
    const {githubModules, otherModules, cacheKeys, processedCount} = partitionModules({
      moduleList,
      previousData,
      results,
      cache: repositoryCache,
      shouldFetchCallback: shouldFetch
    });
    moduleCount += processedCount;

    // Process GitHub modules in batches using GraphQL
    await processGitHubModules(githubModules, headers, previousData, results, {
      cache: repositoryCache,
      cacheKeys
    });

    // Process non-GitHub modules individually
    for (const module of otherModules) {
      const repositoryId = module.id;
      moduleCount += 1;

      logger.info(`${moduleCount} / ${moduleListLength} - ${module.name}`);
      try {
        const {response, data, branchData, repoType} = await fetchRepositoryData(module, httpClient, process.env);

        if (response.status === 200) {
          const normalizedRepositoryData = normalizeRepositoryData(data, branchData, repoType);
          const cacheKey = cacheKeys.get(module.id);
          const cacheEntry = cacheKey
            ? repositoryCache.set(cacheKey, normalizedRepositoryData, {
              ttlMs: REPOSITORY_CACHE_TTL_MS,
              metadata: {host: repoType, strategy: "rest"}
            })
            : null;

          applyRepositoryData(module, normalizedRepositoryData);
          const repositoryData = createRepositoryDataRecord({
            moduleId: module.id,
            normalizedData: normalizedRepositoryData,
            timestamp: cacheEntry?.updatedAt ?? new Date().toISOString()
          });
          results.push(repositoryData);
        } else {
          logger.error("Error fetching API data:", {status: response.status, statusText: response.statusText});
          useHistoricalData(previousData, repositoryId, module, results);
        }
      } catch (error) {
        logger.error(`Error fetching data for ${module.url}:`, error.message);
        useHistoricalData(previousData, repositoryId, module, results);
      }

      /*
       * Non-GitHub repositories tend to have fewer users and thus fewer stars;
       * to compensate for this and make their popularity more comparable,
       * we multiply their star count by 3 (empirically chosen) and ensure a minimum of 1 star.
       */
      if (!module.url.includes("github.com")) {
        module.stars = Math.max(1, (typeof module.stars === "number" ? module.stars : 0) * 3);
      }
    }

    const updateInfo = {
      lastUpdate: new Date().toISOString(),
      repositories: results
    };

    const sortedModuleList = moduleList.sort(sortByNameIgnoringPrefix);
    validateStageData("modules.stage.2", sortedModuleList);

    fs.writeFileSync(localFilePath, JSON.stringify(updateInfo, null, 2));
    fs.writeFileSync("website/data/modules.stage.2.json", JSON.stringify(sortedModuleList, null, 2));
    if (maxQueryCount < queryCount) {
      maxQueryCount = 0;
    }
    logger.info("Repository data update completed.", {
      queryCount,
      maxQueryCount,
      results: results.length,
      modules: moduleListLength
    });
  } catch (error) {
    logger.error("Error fetching repository API data:", error);
  } finally {
    try {
      await repositoryCache.flush();
    } catch (error) {
      logger.error("Error flushing repository cache:", error);
    }
  }
}

updateData();
