import fs from "node:fs";
import {getJson} from "./utils.js";
import process from "node:process";
import {validateStageData} from "./lib/schemaValidator.js";

let queryCount = 0;
let maxQueryCount = 58;
let moduleCount = 0;

const GITHUB_GRAPHQL_BATCH_SIZE = 100;

// Function to detect the repository hosting service
function getRepositoryType (url) {
  if (url.includes("github.com")) {
    return "github";
  }
  if (url.includes("gitlab.com")) {
    return "gitlab";
  }
  if (url.includes("bitbucket.org")) {
    return "bitbucket";
  }
  if (url.includes("codeberg.org")) {
    return "codeberg";
  }
  return "unknown";
}

// Function to extract repository ID based on the hosting service
function getRepositoryId (url) {
  const urlParts = url.split("/");
  const hostIndex = urlParts.findIndex((part) =>
    part.includes("github.com") ||
    part.includes("gitlab.com") ||
    part.includes("bitbucket.org") ||
    part.includes("codeberg.org"));

  if (hostIndex !== -1 && urlParts.length > hostIndex + 2) {
    return `${urlParts[hostIndex + 1]}/${urlParts[hostIndex + 2]}`;
  }
  return null;
}

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
          licenseInfo { spdxId }
          defaultBranchRef {
            name
            target {
              ... on Commit {
                committedDate
              }
            }
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
        lastCommit: repo.defaultBranchRef?.target?.committedDate ?? null
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

function sortModuleListByLastUpdate (previousData, moduleList) {
  moduleList.sort((a, b) => {
    const lastUpdateA = previousData.repositories?.find((repo) => repo.id === a.id)?.gitHubDataLastUpdate;
    const lastUpdateB = previousData.repositories?.find((repo) => repo.id === b.id)?.gitHubDataLastUpdate;

    if (!lastUpdateA && !lastUpdateB) {
      return 0;
    } else if (!lastUpdateA) {
      return -1;
    } else if (!lastUpdateB) {
      return 1;
    }
    return new Date(lastUpdateA) - new Date(lastUpdateB);
  });
}

function sortByNameIgnoringPrefix (a, b) {
  const nameA = a.name.replace("MMM-", "");
  const nameB = b.name.replace("MMM-", "");
  return nameA.localeCompare(nameB);
}

async function loadPreviousData (remoteFilePath, localFilePath) {
  let previousData = {};
  try {
    const response = await fetch(remoteFilePath);
    if (response.ok) {
      previousData = await response.json();
    } else if (fs.existsSync(localFilePath)) {
      previousData = JSON.parse(fs.readFileSync(localFilePath));
    } else {
      console.warn(`Local file ${localFilePath} does not exist.`);
    }
  } catch (error) {
    console.error("Error fetching remote data, falling back to local file:", error);
    try {
      previousData = JSON.parse(fs.readFileSync(localFilePath));
    } catch (localError) {
      console.error("Error reading local data:", localError);
    }
  }
  return previousData;
}

async function processGitHubModules (githubModules, headers, previousData, results) {
  console.log(`Fetching ${githubModules.length} GitHub repos via GraphQL (batches of ${GITHUB_GRAPHQL_BATCH_SIZE})...`);
  for (let index = 0; index < githubModules.length; index += GITHUB_GRAPHQL_BATCH_SIZE) {
    const batch = githubModules.slice(index, index + GITHUB_GRAPHQL_BATCH_SIZE);
    moduleCount += batch.length;

    try {
      const batchResults = await fetchGitHubBatch(batch, headers);

      for (const module of batch) {
        const normalizedRepositoryData = batchResults[module.id];

        if (normalizedRepositoryData) {
          const repositoryData = {
            id: module.id,
            gitHubDataLastUpdate: new Date().toISOString(),
            gitHubData: normalizedRepositoryData
          };

          module.stars = normalizedRepositoryData.stars;
          if (normalizedRepositoryData.has_issues === false) {
            module.hasGithubIssues = false;
          }
          if (normalizedRepositoryData.archived === true) {
            module.isArchived = true;
          }
          if (normalizedRepositoryData.license) {
            module.license = normalizedRepositoryData.license;
          }
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

    // Group modules by hosting type
    const githubModules = [];
    const otherModules = [];

    for (const module of moduleList) {
      const shouldFetchData = shouldFetch(module);
      if (!shouldFetchData) {
        useHistoricalData(previousData, module.id, module, results);
        moduleCount += 1;
      } else if (getRepositoryType(module.url) === "github") {
        githubModules.push(module);
      } else {
        otherModules.push(module);
      }
    }

    // Process GitHub modules in batches using GraphQL
    await processGitHubModules(githubModules, headers, previousData, results);

    // Process non-GitHub modules individually
    for (const module of otherModules) {
      const repositoryId = module.id;
      moduleCount += 1;

      console.log(`${moduleCount} / ${moduleListLength} - ${module.name}`);
      try {
        const {response, data, branchData, repoType} = await fetchRepositoryData(module, headers);

        if (response.status === 200) {
          const normalizedRepositoryData = normalizeRepositoryData(data, branchData, repoType);

          const repositoryData = {
            id: module.id,
            gitHubDataLastUpdate: new Date().toISOString(),
            gitHubData: normalizedRepositoryData
          };

          module.stars = normalizedRepositoryData.stars;
          if (normalizedRepositoryData.has_issues === false) {
            module.hasGithubIssues = false;
          }
          if (normalizedRepositoryData.archived === true) {
            module.isArchived = true;
          }
          if (normalizedRepositoryData.license) {
            module.license = normalizedRepositoryData.license;
          }
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
  }
}

function createDefaultRepositoryData ({repositoryId, module}) {
  if (typeof module.stars !== "number") {
    module.stars = 0;
  }
  if (typeof module.hasGithubIssues !== "boolean") {
    module.hasGithubIssues = true;
  }
  if (typeof module.isArchived !== "boolean") {
    module.isArchived = false;
  }

  return {
    id: repositoryId,
    gitHubDataLastUpdate: null,
    gitHubData: {
      issues: 0,
      stars: module.stars,
      license: module.license ?? null,
      archived: module.isArchived === true,
      disabled: false,
      defaultBranch: null,
      has_issues: module.hasGithubIssues,
      lastCommit: null
    }
  };
}

function useHistoricalData (previousData, repositoryId, module, results) {
  // Add the existing data without updating it
  const existingRepository = previousData.repositories?.find((repo) => repo.id === repositoryId);
  if (existingRepository) {
    module.stars = existingRepository.gitHubData.stars;

    if (existingRepository.gitHubData.has_issues === false) {
      module.hasGithubIssues = false;
    }

    if (existingRepository.gitHubData.archived === true) {
      module.isArchived = true;
    }
    if (existingRepository.gitHubData.license) {
      module.license = existingRepository.gitHubData.license;
    }
    results.push(existingRepository);
    return;
  }

  const fallbackData = createDefaultRepositoryData({repositoryId, module});
  results.push(fallbackData);
}

updateData();
