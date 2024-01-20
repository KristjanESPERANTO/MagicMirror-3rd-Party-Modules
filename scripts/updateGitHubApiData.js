import fs from "node:fs";

// Function to check whether new data should be retrieved.
function shouldFetch (repository, lastUpdate) {
  let retrieve = false;
  if (lastUpdate) {
    const now = new Date();
    const daysSinceLastUpdate = Math.round((now - new Date(lastUpdate)) / (1000 * 60 * 60 * 24));
    const lastCommitDate = repository.gitHubData ? new Date(repository.gitHubData.lastCommit) : new Date(-20);
    const isUpdateLongAgo = daysSinceLastUpdate > 7;
    const wasLastUpdateBeforeLastCommit = lastUpdate < lastCommitDate.toISOString();

    retrieve = isUpdateLongAgo || wasLastUpdateBeforeLastCommit;
  } else {
    // If there is no previous data, always retrieve.
    retrieve = true;
  }
  return retrieve;
}

async function updateData () {
  try {
    // Read the previous version of the data
    let previousData = {};
    try {
      previousData = JSON.parse(fs.readFileSync("docs/gitHubData.json"));
    } catch (error) {
      // The file does not yet exist or could not be read
    }

    const moduleList = JSON.parse(fs.readFileSync("repositories.json"));
    const results = [];

    for (const module of moduleList) {
      const repositoryId = module.id;
      const url = `https://api.github.com/repos/${repositoryId}`;

      // Check whether the data should be retrieved again
      const lastUpdate = previousData.repositories?.find((repo) => repo.id === repositoryId)?.gitHubDataLastUpdate;
      const shouldFetchData = shouldFetch(module, lastUpdate);

      if (shouldFetchData) {
        const response = await fetch(url);
        const data = await response.json();

        const branchUrl = `https://api.github.com/repos/${repositoryId}/commits/${data.default_branch}`;
        const branchResponse = await fetch(branchUrl);
        const branchData = await branchResponse.json();

        const repositoryData = {
          "id": module.id,
          "gitHubDataLastUpdate": new Date().toISOString(),
          "gitHubData": {
            "issues": data.open_issues,
            "stars": data.stargazers_count,
            "license": data.license ? data.license.spdx_id : null,
            "archived": data.archived,
            "disabled": data.disabled,
            "defaultBranch": data.default_branch,
            "lastCommit": branchData.commit ? branchData.commit.author.date : null
          }
        };

        results.push(repositoryData);
      } else {
        // Add the existing data without updating it
        results.push(previousData.repositories?.find((repo) => repo.id === repositoryId));
      }
    }

    const updateInfo = {
      "lastUpdate": new Date().toISOString(),
      "repositories": results
    };

    fs.writeFileSync("docs/gitHubData.json", JSON.stringify(updateInfo, null, 2));
    console.info("GitHub data update completed successfully.");
  } catch (error) {
    console.error("Error fetching GitHub API data:", error);
  }
}

updateData();


// Funtion for testing purposes. Can be removed.
// eslint-disable-next-line no-unused-vars
function checkUpdate () {
  const lastUpdate = new Date("2023-01-12T23:30:22.077Z");
  const now = new Date();
  const daysSinceLastUpdate = Math.round((now - lastUpdate) / (1000 * 60 * 60 * 24));

  console.log(daysSinceLastUpdate);
  console.log(daysSinceLastUpdate > 7);
}

// - checkUpdate();
