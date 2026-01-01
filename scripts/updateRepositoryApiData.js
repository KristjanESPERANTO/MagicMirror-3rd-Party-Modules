/*
 * This script refreshes the public metadata for every third-party module each day
 * (stars, recent updates, archived status, …) and writes the results into the website
 * JSON files. It keeps successful API responses in a small cache so we avoid redundant
 * requests and stay within GitHub rate limits. If a request fails, the script falls back
 * to the most recent known values so the published dataset remains complete.
 */
import {
  getRepositoryId,
  getRepositoryType,
  loadPreviousData,
  sortByNameIgnoringPrefix,
  sortModuleListByLastUpdate,
  useHistoricalData
} from "./updateRepositoryApiData/helpers.js";
import {createPersistentCache} from "./shared/persistent-cache.js";
import fs from "node:fs";
import {getJson} from "./utils.js";
import path from "node:path";
import process from "node:process";
import {validateStageData} from "./lib/schemaValidator.js";

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


function shouldFetch (repository) {
  const repoType = getRepositoryType(repository.url);
  return repoType !== "unknown" && maxQueryCount > 0 && (queryCount < maxQueryCount || process.env.GITHUB_TOKEN);
}

function getRepositoryCacheKey (module) {
  const repoType = getRepositoryType(module.url);
  const repoId = getRepositoryId(module.url);
  if (!repoId || repoType === "unknown") {
    return null;
  }
  return `${repoType}:${repoId.toLowerCase()}`;
}

function applyRepositoryData (module, normalizedData) {
  module.stars = normalizedData.stars;
  if (normalizedData.has_issues === false) {
    module.hasGithubIssues = false;
  }
  if (normalizedData.archived === true) {
    module.isArchived = true;
  }
  if (normalizedData.license) {
    module.license = normalizedData.license;
  }
}

function createRepositoryDataRecord ({moduleId, normalizedData, timestamp}) {
  return {
    id: moduleId,
    gitHubDataLastUpdate: timestamp,
    gitHubData: normalizedData
  };
}

function partitionModules ({moduleList, previousData, results, cache}) {
  const githubModules = [];
  const otherModules = [];
  const cacheKeys = new Map();
  let processedCount = 0;

  for (const module of moduleList) {
    const cacheKey = getRepositoryCacheKey(module);
    let handledByCache = false;

    if (cacheKey) {
      cacheKeys.set(module.id, cacheKey);
      const cacheEntry = cache.get(cacheKey);
      if (cacheEntry) {
        applyRepositoryData(module, cacheEntry.value);
        const record = createRepositoryDataRecord({
          moduleId: module.id,
          normalizedData: cacheEntry.value,
          timestamp: cacheEntry.updatedAt ?? new Date().toISOString()
        });
        results.push(record);
        processedCount += 1;
        handledByCache = true;
      }
    }

    if (!handledByCache) {
      const shouldFetchData = shouldFetch(module);
      if (!shouldFetchData) {
        useHistoricalData(previousData, module.id, module, results);
        processedCount += 1;
      } else if (getRepositoryType(module.url) === "github") {
        githubModules.push(module);
      } else {
        otherModules.push(module);
      }
    }
  }

  return {githubModules, otherModules, cacheKeys, processedCount};
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

  const response = await fetch("https://api.github.com/graphql", {
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
    console.info(
      "GitHub GraphQL rate limit:",
      `cost=${rateLimitCost ?? "?"}`,
      `used=${rateLimitUsed ?? "?"}`,
      `remaining=${rateLimitRemaining ?? "?"}`,
      `resetsAt=${rateLimitResetIso}`
    );
  }

  queryCount += 1;

  if (!response.ok) {
    if (response.status === 403) {
      const rateLimitInfo = response.headers.get("x-ratelimit-remaining");
      const resetTime = response.headers.get("x-ratelimit-reset");
      const resetDate = resetTime ? new Date(Number.parseInt(resetTime, 10) * 1000).toISOString() : "unknown";

      console.warn([
        "\n⚠️  GitHub API rate limit exceeded (403).",
        `Remaining: ${rateLimitInfo ?? "0"}.`,
        `Resets at: ${resetDate}.`,
        "💡 Tip: Set GITHUB_TOKEN environment variable with a valid personal access token.",
        "   Create one at: https://github.com/settings/tokens\n"
      ].join(" "));
    }
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    console.error("GraphQL errors:", JSON.stringify(result.errors, null, 2));
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

// Function to fetch repository data based on the hosting service (non-GitHub)
async function fetchRepositoryData (module, headers) {
  const repoType = getRepositoryType(module.url);
  const repoId = getRepositoryId(module.url, repoType);

  if (!repoId) {
    throw new Error(`Could not extract repository ID from URL: ${module.url}`);
  }

  let apiUrl, branchUrl;

  switch (repoType) {
    case "github":
      apiUrl = `https://api.github.com/repos/${repoId}`;
      break;
    case "gitlab": {
      // GitLab API uses URL-encoded project IDs
      const encodedId = encodeURIComponent(repoId);
      apiUrl = `https://gitlab.com/api/v4/projects/${encodedId}`;
      break;
    }
    case "bitbucket":
      apiUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}`;
      break;
    case "codeberg":
      // Codeberg uses Gitea API
      apiUrl = `https://codeberg.org/api/v1/repos/${repoId}`;
      break;
    default:
      throw new Error(`Unsupported repository type: ${repoType}`);
  }

  const response = await fetch(apiUrl, {headers});
  const data = await response.json();
  queryCount += 1;

  // Fetch branch data
  let branchData = null;
  if (response.status === 200) {
    switch (repoType) {
      case "github":
        branchUrl = `https://api.github.com/repos/${repoId}/commits/${data.default_branch}`;
        break;
      case "gitlab":
      { const encodedIdForBranch = encodeURIComponent(repoId);
        branchUrl = `https://gitlab.com/api/v4/projects/${encodedIdForBranch}/repository/commits/${data.default_branch}`;
        break; }
      case "bitbucket":
        branchUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}/commits/${data.mainbranch?.name || "main"}`;
        break;
      case "codeberg":
        branchUrl = `https://codeberg.org/api/v1/repos/${repoId}/commits/${data.default_branch}`;
        break;
    }

    if (branchUrl) {
      const branchResponse = await fetch(branchUrl, {headers});
      branchData = await branchResponse.json();
      queryCount += 1;
    }
  }

  return {response, data, branchData, repoType};
}

// Function to normalize API responses from different hosting services
function normalizeRepositoryData (data, branchData, repoType) {
  const common = {
    archived: data.archived ?? false,
    disabled: data.disabled ?? false,
    defaultBranch: data.default_branch ?? data.mainbranch?.name ?? "main"
  };

  switch (repoType) {
    case "github":
      return {
        ...common,
        issues: data.open_issues,
        stars: data.stargazers_count,
        license: data.license?.spdx_id ?? null,
        has_issues: data.has_issues,
        lastCommit: branchData?.commit?.author?.date ?? null
      };
    case "gitlab":
      return {
        ...common,
        issues: data.open_issues_count,
        stars: data.star_count,
        license: null,
        has_issues: data.issues_enabled,
        lastCommit: branchData?.committed_date ?? null
      };
    case "bitbucket":
      return {
        ...common,
        issues: 0,
        stars: 0,
        license: data.license?.key ?? null,
        has_issues: data.has_issues,
        lastCommit: branchData?.date ?? null
      };
    case "codeberg":
      return {
        ...common,
        issues: data.open_issues_count,
        stars: data.stars_count,
        license: data.licenses?.[0] ?? null,
        has_issues: data.has_issues,
        lastCommit: branchData?.commit?.author?.date ?? null
      };
    default:
      return common;
  }
}


async function processGitHubModules (githubModules, headers, previousData, results, {cache, cacheKeys} = {}) {
  console.log(`Fetching ${githubModules.length} GitHub repos via GraphQL (batches of ${GITHUB_GRAPHQL_BATCH_SIZE})...`);
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

      console.log(`Processed ${Math.min(index + GITHUB_GRAPHQL_BATCH_SIZE, githubModules.length)}/${githubModules.length} GitHub repos`);
    } catch (error) {
      console.error("Error fetching GitHub batch:", error.message);
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
      cache: repositoryCache
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

      console.log(`${moduleCount} / ${moduleListLength} - ${module.name}`);
      try {
        const {response, data, branchData, repoType} = await fetchRepositoryData(module, headers);

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
          console.error("\nError fetching API data:", response.status, response.statusText);
          useHistoricalData(previousData, repositoryId, module, results);
        }
      } catch (error) {
        console.error(`\nError fetching data for ${module.url}:`, error.message);
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
    console.info("\nRepository data update completed. queryCount:", queryCount, "maxQueryCount:", maxQueryCount, "results:", results.length, "modules:", moduleListLength);
  } catch (error) {
    console.error("Error fetching repository API data:", error);
  } finally {
    try {
      await repositoryCache.flush();
    } catch (error) {
      console.error("Error flushing repository cache:", error);
    }
  }
}

updateData();
