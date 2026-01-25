/**
 * Remote SHA Fetcher
 *
 * Fetches git commit SHAs from remote repositories via API without cloning.
 * Falls back to null if API unavailable (requires local git operations).
 */

import { buildAuthHeadersFromEnv, createHttpClient } from "../shared/http-client.js";
import { createLogger } from "../shared/logger.js";
import { createRateLimiter } from "../shared/rate-limiter.js";

const logger = createLogger("remote-sha");

const rateLimiter = createRateLimiter({
  tokensPerInterval: 5,
  intervalMs: 1000
});

const httpClient = createHttpClient({
  rateLimiter,
  defaultHeaders: {
    "User-Agent": "MagicMirror-Module-Checker"
  }
});

/**
 * Parse GitHub repository URL to extract owner and repo
 * @param {string} url - Repository URL
 * @returns {{owner: string, repo: string} | null}
 */
function parseGitHubUrl(url) {
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u,
    /github\.com\/([^/]+)\/([^/]+)/u
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }

  return null;
}

/**
 * Parse GitLab repository URL to extract project path
 * @param {string} url - Repository URL
 * @returns {string | null}
 */
function parseGitLabUrl(url) {
  const match = url.match(/gitlab\.com\/(.+?)(?:\.git)?$/u);
  return match ? match[1] : null;
}

/**
 * Parse Bitbucket repository URL
 * @param {string} url - Repository URL
 * @returns {string | null}
 */
function parseBitbucketUrl(url) {
  const match = url.match(/bitbucket\.org\/(.+?)(?:\.git)?$/u);
  return match ? match[1] : null;
}

/**
 * Parse Codeberg repository URL
 * @param {string} url - Repository URL
 * @returns {string | null}
 */
function parseCodebergUrl(url) {
  const match = url.match(/codeberg\.org\/(.+?)(?:\.git)?$/u);
  return match ? match[1] : null;
}

/**
 * Fetch commit SHA from GitHub API
 * @param {string} url - Repository URL
 * @param {string} branch - Branch name (defaults to 'master')
 * @returns {Promise<string | null>}
 */
async function getGitHubCommitSha(url, branch = "master") {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return null;
  }

  const { owner, repo } = parsed;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

  const headers = {
    Accept: "application/vnd.github.v3+json",
    ...buildAuthHeadersFromEnv()
  };

  try {
    const result = await httpClient.getJson(apiUrl, { headers });

    if (!result.ok) {
      // Branch might not exist, try default branch
      if (result.status === 404 && branch !== "main") {
        return getGitHubCommitSha(url, "main");
      }
      logger.debug(`GitHub API error for ${owner}/${repo}: ${result.status}`);
      return null;
    }

    return result.data.sha || null;
  }
  catch (error) {
    logger.debug(`Failed to fetch GitHub SHA for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Fetch commit SHA from GitLab API
 * @param {string} url - Repository URL
 * @param {string} branch - Branch name (defaults to 'master')
 * @returns {Promise<string | null>}
 */
async function getGitLabCommitSha(url, branch = "master") {
  const projectPath = parseGitLabUrl(url);
  if (!projectPath) {
    return null;
  }

  const encodedPath = encodeURIComponent(projectPath);
  const apiUrl = `https://gitlab.com/api/v4/projects/${encodedPath}/repository/commits/${branch}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "MagicMirror-Module-Checker" }
    });

    if (!response.ok) {
      // Try 'main' branch if 'master' fails
      if (response.status === 404 && branch !== "main") {
        return getGitLabCommitSha(url, "main");
      }
      logger.debug(`GitLab API error for ${projectPath}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.id || null;
  }
  catch (error) {
    logger.debug(`Failed to fetch GitLab SHA for ${projectPath}: ${
      error instanceof Error ? error.message : String(error)
    }`);
    return null;
  }
}

/**
 * Fetch commit SHA from Bitbucket API
 * @param {string} url - Repository URL
 * @param {string} branch - Branch name (defaults to 'master')
 * @returns {Promise<string | null>}
 */
async function getBitbucketCommitSha(url, branch = "master") {
  const repoPath = parseBitbucketUrl(url);
  if (!repoPath) {
    return null;
  }

  const apiUrl = `https://api.bitbucket.org/2.0/repositories/${repoPath}/commits/${branch}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "MagicMirror-Module-Checker" }
    });

    if (!response.ok) {
      // Try 'main' branch if 'master' fails
      if (response.status === 404 && branch !== "main") {
        return getBitbucketCommitSha(url, "main");
      }
      logger.debug(`Bitbucket API error for ${repoPath}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    // Bitbucket returns array of commits, take first
    const commits = data.values || [];
    return commits.length > 0 ? commits[0].hash : null;
  }
  catch (error) {
    logger.debug(`Failed to fetch Bitbucket SHA for ${repoPath}: ${
      error instanceof Error ? error.message : String(error)
    }`);
    return null;
  }
}

/**
 * Fetch commit SHA from Codeberg API (Gitea-based)
 * @param {string} url - Repository URL
 * @param {string} branch - Branch name (defaults to 'master')
 * @returns {Promise<string | null>}
 */
async function getCodebergCommitSha(url, branch = "master") {
  const repoPath = parseCodebergUrl(url);
  if (!repoPath) {
    return null;
  }

  const apiUrl = `https://codeberg.org/api/v1/repos/${repoPath}/commits/${branch}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "MagicMirror-Module-Checker" }
    });

    if (!response.ok) {
      // Try 'main' branch if 'master' fails
      if (response.status === 404 && branch !== "main") {
        return getCodebergCommitSha(url, "main");
      }
      logger.debug(`Codeberg API error for ${repoPath}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.sha || null;
  }
  catch (error) {
    logger.debug(`Failed to fetch Codeberg SHA for ${repoPath}: ${
      error instanceof Error ? error.message : String(error)
    }`);
    return null;
  }
}

/**
 * Get remote commit SHA via API (without cloning)
 *
 * Tries to fetch the current commit SHA from the repository's hosting platform
 * API. Returns null if:
 * - Platform is not supported
 * - API call fails
 * - Repository doesn't exist or is private
 *
 * When null is returned, the caller should fall back to cloning + git operations.
 *
 * @param {string} url - Repository URL
 * @param {string} [branch="master"] - Branch name
 * @returns {Promise<string | null>} Commit SHA or null if unavailable
 */
export async function getRemoteCommitSha(url, branch = "master") {
  if (!url) {
    return null;
  }

  // Try each platform
  if (url.includes("github.com")) {
    return await getGitHubCommitSha(url, branch);
  }

  if (url.includes("gitlab.com")) {
    return await getGitLabCommitSha(url, branch);
  }

  if (url.includes("bitbucket.org")) {
    return await getBitbucketCommitSha(url, branch);
  }

  if (url.includes("codeberg.org")) {
    return await getCodebergCommitSha(url, branch);
  }

  // Unsupported platform - caller must clone
  logger.debug(`Unsupported platform for URL: ${url}`);
  return null;
}
