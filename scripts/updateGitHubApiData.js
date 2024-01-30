import fs from "node:fs";
import process from "node:process";

let queryCount = 0;
let maxQueryCount = 300;
let moduleCount = 0;

function printProgress (count, total) {
  process.stdout.cursorTo(0);
  process.stdout.write(`${count} / ${total}`);
}

function getJson (filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(data);
  return json;
}

// Function to check whether new data should be retrieved.
function shouldFetch (repository, lastUpdate) {
  let retrieve = false;
  if (repository.url.includes("github.com")) {
    if (queryCount < maxQueryCount) {
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
    }
  }
  return retrieve;
}

async function updateData () {
  try {
    // Read the previous version of the data
    let previousData = {};
    try {
      previousData = JSON.parse(fs.readFileSync("docs/data/gitHubData.json"));
    } catch (error) {
      console.error("Error reading previous data:", error);
    }

    const moduleListData = await getJson("./docs/data/modules.stage.1.json");
    const moduleList = moduleListData.modules;
    const moduleListLength = moduleList.length;

    const results = [];

    for (const module of moduleList) {
      const repositoryId = module.id;
      const repositoryApiUrl = `https://api.github.com/repos/${repositoryId}`;
      moduleCount += 1;
      printProgress(moduleCount, moduleListLength);

      // Check whether the data should be retrieved again
      const lastUpdate = previousData.repositories?.find((repo) => repo.id === repositoryId)?.gitHubDataLastUpdate;
      const shouldFetchData = shouldFetch(module, lastUpdate);

      if (shouldFetchData) {
        const response = await fetch(repositoryApiUrl);
        const data = await response.json();
        queryCount += 1;

        const branchUrl = `https://api.github.com/repos/${repositoryId}/commits/${data.default_branch}`;
        const branchResponse = await fetch(branchUrl);
        const branchData = await branchResponse.json();
        queryCount += 1;

        if (response.status === 200) {
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
          console.error("\nError fetching GitHub API data:", response.status, response.statusText);
          maxQueryCount = 0;
        }
      } else {
        // Add the existing data without updating it
        const existingRepository = previousData.repositories?.find((repo) => repo.id === repositoryId);
        if (existingRepository) {
          results.push(existingRepository);
        }
      }
    }

    const updateInfo = {
      "lastUpdate": new Date().toISOString(),
      "repositories": results
    };

    fs.writeFileSync("docs/data/gitHubData.json", JSON.stringify(updateInfo, null, 2));
    console.info("\nGitHub data update completed. queryCount:", queryCount, "maxQueryCount:", maxQueryCount, "results:", results.length, "modules:", moduleListLength);
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
