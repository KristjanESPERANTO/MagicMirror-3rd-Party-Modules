/* eslint-disable no-continue */
import fs from "node:fs";
import {getJson} from "./utils.js";

function getRepoIdFromUrl (url) {
  if (!url || typeof url !== "string") {
    return null;
  }
  const parts = url.replace(/\.git$/u, "").split("/");
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return null;
}

async function setSkipFlags () {
  const stage2Path = "./docs/data/modules.stage.2.json";
  const gitHubDataPath = "./docs/data/gitHubData.json";
  const previousModulesPath = "./docs/data/modules.json";

  const modules = await getJson(stage2Path);

  let gitHubData = {repositories: []};
  try {
    gitHubData = await getJson(gitHubDataPath);
  } catch {
    console.warn("set_skip_flags: no gitHubData.json available; repo lastCommit data missing.");
  }

  let previousModules = [];
  try {
    previousModules = await getJson(previousModulesPath);
  } catch {
    // No previous results available; we will not skip anything.
  }

  const prevMap = new Map();
  for (const pm of previousModules || []) {
    if (!pm) {
      continue;
    }
    prevMap.set(`${pm.name}-----${pm.maintainer}`, pm);
  }

  const repoMap = new Map();
  for (const repo of gitHubData.repositories || []) {
    if (!repo) {
      continue;
    }
    repoMap.set(repo.id, repo.gitHubData?.lastCommit || null);
  }

  let skipped = 0;
  let missingRepoId = 0;
  let missingLastCommit = 0;

  for (const module of modules || []) {
    const key = `${module.name}-----${module.maintainer}`;
    const prev = prevMap.get(key);

    const repoId = module.id || getRepoIdFromUrl(module.url);
    if (!repoId) {
      missingRepoId += 1;
      continue;
    }

    const currentLast = repoMap.has(repoId) ? repoMap.get(repoId) : null;
    if (!currentLast) {
      missingLastCommit += 1;
      continue;
    }

    /*
     *Decide skip: when we have a previous check timestamp (prev.lastChecked)
     *and the repository lastCommit timestamp, skip when lastCommit <= lastChecked
     *(i.e. nothing new since the last completed check).
     */
    let shouldSkip = false;
    if (prev && prev.lastChecked) {
      try {
        const lastCommitTime = Date.parse(currentLast);
        const lastCheckedTime = Date.parse(prev.lastChecked);
        if (!Number.isNaN(lastCommitTime) && !Number.isNaN(lastCheckedTime) && lastCommitTime <= lastCheckedTime) {
          shouldSkip = true;
        }
      } catch {
        shouldSkip = false;
      }
    }

    if (shouldSkip) {
      module.skip = true;
      // Merge previous module fields into current module but keep identity fields
      const keep = {name: module.name, maintainer: module.maintainer, url: module.url, id: module.id};
      Object.assign(module, prev || {});
      Object.assign(module, keep);
      skipped += 1;
    }
  }

  fs.writeFileSync("./docs/data/modules.stage.3.json", JSON.stringify(modules, null, 2), "utf8");
  console.info(`set_skip_flags: processed ${modules.length} modules, skipped=${skipped}, missingRepoId=${missingRepoId}, missingLastCommit=${missingLastCommit}`);
}

setSkipFlags();
