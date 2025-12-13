import fs from "node:fs";

export function getRepositoryType (url) {
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

export function getRepositoryId (url) {
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

export function sortModuleListByLastUpdate (previousData, moduleList) {
  moduleList.sort((a, b) => {
    const lastUpdateA = previousData.repositories?.find((repo) => repo.id === a.id)?.gitHubDataLastUpdate;
    const lastUpdateB = previousData.repositories?.find((repo) => repo.id === b.id)?.gitHubDataLastUpdate;

    if (!lastUpdateA && !lastUpdateB) {
      return 0;
    }

    if (!lastUpdateA) {
      return -1;
    }

    if (!lastUpdateB) {
      return 1;
    }

    return new Date(lastUpdateA) - new Date(lastUpdateB);
  });
}

export function sortByNameIgnoringPrefix (a, b) {
  const nameA = a.name.replace("MMM-", "");
  const nameB = b.name.replace("MMM-", "");
  return nameA.localeCompare(nameB);
}

export async function loadPreviousData (remoteFilePath, localFilePath) {
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

export function createDefaultRepositoryData ({repositoryId, module}) {
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

export function useHistoricalData (previousData, repositoryId, module, results) {
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
