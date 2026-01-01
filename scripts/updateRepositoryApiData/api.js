import {getRepositoryId, getRepositoryType} from "./helpers.js";
import {Buffer} from "node:buffer";
import process from "node:process";

// Function to fetch repository data based on the hosting service (non-GitHub)
export async function fetchRepositoryData (module, httpClient, env = process.env) {
  const repoType = getRepositoryType(module.url);
  const repoId = getRepositoryId(module.url, repoType);

  if (!repoId) {
    throw new Error(`Could not extract repository ID from URL: ${module.url}`);
  }

  let apiUrl, branchUrl;
  const headers = {};

  switch (repoType) {
    case "github":
      apiUrl = `https://api.github.com/repos/${repoId}`;
      if (env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
      }
      break;
    case "gitlab": {
      // GitLab API uses URL-encoded project IDs
      const encodedId = encodeURIComponent(repoId);
      apiUrl = `https://gitlab.com/api/v4/projects/${encodedId}`;
      if (env.GITLAB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITLAB_TOKEN}`;
      }
      break;
    }
    case "bitbucket":
      apiUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}`;
      if (env.BITBUCKET_USERNAME && env.BITBUCKET_APP_PASSWORD) {
        const auth = Buffer.from(`${env.BITBUCKET_USERNAME}:${env.BITBUCKET_APP_PASSWORD}`).toString("base64");
        headers.Authorization = `Basic ${auth}`;
      }
      break;
    case "codeberg":
      // Codeberg uses Gitea API
      apiUrl = `https://codeberg.org/api/v1/repos/${repoId}`;
      if (env.CODEBERG_TOKEN) {
        headers.Authorization = `token ${env.CODEBERG_TOKEN}`;
      }
      break;
    default:
      throw new Error(`Unsupported repository type: ${repoType}`);
  }

  const result = await httpClient.getJson(apiUrl, {headers});
  const data = result.data;

  // Fetch branch data
  let branchData = null;
  if (result.status === 200) {
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
      const branchResult = await httpClient.getJson(branchUrl, {headers});
      branchData = branchResult.data;
    }

    // Fetch watchers for Bitbucket (as a proxy for stars)
    if (repoType === "bitbucket") {
      const watchersUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}/watchers?pagelen=1`;
      const watchersResult = await httpClient.getJson(watchersUrl, {headers});
      if (watchersResult.status === 200) {
        data.watchers_count = watchersResult.data.size;
      }
    }
  }

  return {response: {status: result.status, ok: result.ok}, data, branchData, repoType};
}

// Function to normalize API responses from different hosting services
export function normalizeRepositoryData (data, branchData, repoType) {
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
        stars: data.watchers_count ?? 0,
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
