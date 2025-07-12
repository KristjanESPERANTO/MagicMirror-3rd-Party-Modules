import fs from "node:fs";
import {getJson} from "./utils.js";
import process from "node:process";

let queryCount = 0;
let maxQueryCount = 58;
let moduleCount = 0;

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

// Function to check whether new data should be retrieved.
function shouldFetch (repository) {
  let retrieve = false;
  const repoType = getRepositoryType(repository.url);

  if (repoType !== "unknown" && maxQueryCount > 0) {
    if (queryCount < maxQueryCount || process.env.GITHUB_TOKEN) {
      retrieve = true;
    }
  }
  return retrieve;
}

// Function to fetch repository data based on the hosting service
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
  let normalizedData = {};

  switch (repoType) {
    case "github":
      normalizedData = {
        issues: data.open_issues,
        stars: data.stargazers_count,
        license: data.license ? data.license.spdx_id : null,
        archived: data.archived,
        disabled: data.disabled,
        defaultBranch: data.default_branch,
        has_issues: data.has_issues,
        lastCommit: branchData?.commit ? branchData.commit.author.date : null
      };
      break;
    case "gitlab":
      normalizedData = {
        issues: data.open_issues_count,
        stars: data.star_count,
        license: null, // GitLab API doesn't provide license info directly
        archived: data.archived,
        disabled: false,
        defaultBranch: data.default_branch,
        has_issues: data.issues_enabled,
        lastCommit: branchData?.committed_date || null
      };
      break;
    case "bitbucket":
      normalizedData = {
        issues: 0, // Bitbucket API v2.0 doesn't provide issue count directly
        stars: 0, // Bitbucket has no "stars"
        license: data.license?.key || null,
        archived: false,
        disabled: false,
        defaultBranch: data.mainbranch?.name || "main",
        has_issues: data.has_issues,
        lastCommit: branchData?.date || null
      };
      break;
    case "codeberg":
      normalizedData = {
        issues: data.open_issues_count,
        stars: data.stars_count,
        license: data.licenses?.[0] || null,
        archived: data.archived,
        disabled: false,
        defaultBranch: data.default_branch,
        has_issues: data.has_issues,
        lastCommit: branchData?.commit ? branchData.commit.author.date : null
      };
      break;
  }

  return normalizedData;
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

async function updateData () {
  try {
    // Read the previous version of the data
    let previousData = {};
    const remoteFilePath = "https://modules.magicmirror.builders/data/gitHubData.json";
    const localFilePath = "docs/data/gitHubData.json";

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

    const moduleListData = await getJson("./docs/data/modules.stage.1.json");
    const moduleList = moduleListData.modules;
    const moduleListLength = moduleList.length;

    const results = [];

    sortModuleListByLastUpdate(previousData, moduleList);

    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    for (const module of moduleList) {
      const repositoryId = module.id;
      moduleCount += 1;

      // Check whether the data should be retrieved again
      const shouldFetchData = shouldFetch(module);

      if (shouldFetchData) {
        // PrintProgress(moduleCount, moduleListLength);
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
            maxQueryCount = 0;
            useHistoricalData(previousData, repositoryId, module, results);
          }
        } catch (error) {
          console.error(`\nError fetching data for ${module.url}:`, error.message);
          useHistoricalData(previousData, repositoryId, module, results);
        }
      } else {
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

    fs.writeFileSync(localFilePath, JSON.stringify(updateInfo, null, 2));
    fs.writeFileSync("docs/data/modules.stage.2.json", JSON.stringify(sortedModuleList, null, 2));
    if (maxQueryCount < queryCount) {
      maxQueryCount = 0;
    }
    console.info("\nRepository data update completed. queryCount:", queryCount, "maxQueryCount:", maxQueryCount, "results:", results.length, "modules:", moduleListLength);
  } catch (error) {
    console.error("Error fetching repository API data:", error);
  }
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
  }
}

updateData();
