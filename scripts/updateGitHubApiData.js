import fs from "node:fs";

let queryCount = 0;
let maxQueryCount = 60;
let moduleCount = 0;

function printProgress (count, total) {
  console.log(`${count} / ${total}`);
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
        const isUpdateLongAgo = daysSinceLastUpdate > 14;

        // I am no longer so sure whether this makes sense, as it means that the number of stars is only updated when there are commits. Probably "isUpdateLongAgo" is sufficient. TODO: Investigate again when the moment of need arises.
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

      // Check whether the data should be retrieved again
      const lastUpdate = previousData.repositories?.find((repo) => repo.id === repositoryId)?.gitHubDataLastUpdate;
      const shouldFetchData = shouldFetch(module, lastUpdate);

      if (shouldFetchData) {
        printProgress(moduleCount, moduleListLength);
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
              "has_issues": data.has_issues,
              "lastCommit": branchData.commit ? branchData.commit.author.date : null
            }
          };
          module.stars = data.stargazers_count;

          if (data.has_issues === false) {
            module.issues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
          }

          results.push(repositoryData);
        } else {
          console.error("\nError fetching GitHub API data:", response.status, response.statusText);
          maxQueryCount = 0;
        }
      } else {
        // Add the existing data without updating it
        const existingRepository = previousData.repositories?.find((repo) => repo.id === repositoryId);
        if (existingRepository) {
          module.stars = existingRepository.gitHubData.stars;
          if (existingRepository.gitHubData.has_issues === false) {
            module.issues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
          }
          results.push(existingRepository);
        }
      }

      // Quick-and-dirty way to include the number of stars for non-GitHub repositories.
      if (!module.url.includes("github.com")) {
        switch (module.name) {
          case "MMM-bergfex":
            module.stars = 1;
            break;
          case "MMM-Flights":
            module.stars = 2;
            break;
          case "MMM-InstagramView":
            module.stars = 1;
            break;
          case "mmm-ratp":
            module.stars = 2;
            break;
          case "MMM-NCTtimes":
            module.stars = 1;
            break;
          case "MMM-RecyclingCalendar":
            module.stars = 1;
            break;
          case "MMM-RepoStats":
            module.stars = 2;
            break;
          case "MMM-YouTubeWebView":
            module.stars = 1;
            break;
          default:
            module.stars = 1;
            break;
        }
        // Since far fewer users have accounts with non-GitHub hosts, repos get a small star boost.
        module.stars *= 3;
      }
    }

    const updateInfo = {
      "lastUpdate": new Date().toISOString(),
      "repositories": results
    };

    fs.writeFileSync("docs/data/gitHubData.json", JSON.stringify(updateInfo, null, 2));
    fs.writeFileSync("./docs/data/modules.stage.2.json", JSON.stringify(moduleList, null, 2));
    console.info("\nGitHub data update completed. queryCount:", queryCount, "maxQueryCount:", maxQueryCount, "results:", results.length, "modules:", moduleListLength);
  } catch (error) {
    console.error("Error fetching GitHub API data:", error);
  }
}

updateData();
