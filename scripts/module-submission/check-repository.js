#!/usr/bin/env node

/**
 * Checks repository validity and requirements
 * Usage: node scripts/module-submission/check-repository.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";

// Get files to check from environment variable
const changedFiles = process.env.CHANGED_FILES?.split(" ") || [];
const githubToken = process.env.GITHUB_TOKEN;

const results = {
  accessible: false,
  hasPackageJson: false,
  hasLicense: false,
  hasReadme: false,
  validLicense: false,
  license: null,
  errors: []
};

/**
 * Fetch repository metadata from GitHub/GitLab API
 * @param {string} repoUrl - Repository URL
 * @returns {Promise<object>} Repository metadata
 */
async function fetchRepoMetadata(repoUrl) {
  const url = new URL(repoUrl);
  const [, owner, repo] = url.pathname.split("/");

  if (url.hostname === "github.com") {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo.replace(/\.git$/u, "")}`;
    const headers = { "User-Agent": "MagicMirror-Module-Submission-Bot" };
    if (githubToken) {
      headers.Authorization = `token ${githubToken}`;
    }

    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }
  else if (url.hostname === "gitlab.com") {
    const apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }

    return response.json();
  }

  throw new Error("Unsupported repository host");
}

/**
 * Check if a file exists in the repository
 * @param {string} repoUrl - Repository URL
 * @param {string} fileName - File name to check
 * @returns {Promise<boolean>} Whether file exists
 */
async function checkFileExists(repoUrl, fileName) {
  const url = new URL(repoUrl);
  const [, owner, repo] = url.pathname.split("/");

  if (url.hostname === "github.com") {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo.replace(/\.git$/u, "")}/contents/${fileName}`;
    const headers = { "User-Agent": "MagicMirror-Module-Submission-Bot" };
    if (githubToken) {
      headers.Authorization = `token ${githubToken}`;
    }

    const response = await fetch(apiUrl, { headers });

    return response.ok;
  }
  else if (url.hostname === "gitlab.com") {
    const apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/repository/files/${encodeURIComponent(fileName)}?ref=main`;
    const response = await fetch(apiUrl);

    return response.ok;
  }

  return false;
}

// Valid open-source licenses for MagicMirror modules
const validLicenses = [
  "MIT",
  "Apache-2.0",
  "GPL-3.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "LGPL-3.0"
];

// Process each submission
async function validateRepositories() {
  for (const file of changedFiles) {
    if (!file.endsWith(".json")) {
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      const filePath = resolve(process.cwd(), file);
      const submission = JSON.parse(readFileSync(filePath, "utf8"));

      // Check if repository is accessible
      try {
        const metadata = await fetchRepoMetadata(submission.url);
        results.accessible = true;
        results.license = metadata.license?.spdx_id || metadata.license?.key || null;
        results.validLicense = validLicenses.includes(results.license);
      }
      catch {
        results.errors.push("Repository is not accessible or does not exist");
      }

      // Check for required files
      if (results.accessible) {
        results.hasPackageJson = await checkFileExists(submission.url, "package.json");
        results.hasLicense = await checkFileExists(submission.url, "LICENSE") || await checkFileExists(submission.url, "LICENSE.md") || await checkFileExists(submission.url, "LICENSE.txt");
        results.hasReadme = await checkFileExists(submission.url, "README.md") || await checkFileExists(submission.url, "readme.md");
      }

      // Only check first file
      break;
    }
    catch (error) {
      results.errors.push(`Error checking repository: ${error.message}`);
    }
  }

  // Write results
  writeFileSync("validation-results/repository.json", JSON.stringify(results, null, 2));

  // Report
  console.log("📦 Repository validation:");
  console.log(`  ${results.accessible ? "✅" : "❌"} Repository accessible`);
  console.log(`  ${results.hasPackageJson ? "✅" : "❌"} package.json found`);
  console.log(`  ${results.hasLicense ? "✅" : "❌"} LICENSE file found`);
  console.log(`  ${results.hasReadme ? "✅" : "❌"} README.md found`);
  console.log(`  ${results.validLicense ? "✅" : "⚠️"} License: ${results.license || "not specified"}`);

  if (results.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of results.errors) {
      console.log(`  - ${error}`);
    }
  }
}

// Run validation
validateRepositories().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
