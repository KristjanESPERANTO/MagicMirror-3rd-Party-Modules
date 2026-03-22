import fs from "node:fs";

interface OwnModuleInput {
  branch?: string;
  description?: string;
  url: string;
  [key: string]: unknown;
}

interface Stage1Module extends OwnModuleInput {
  description: string;
  id: string;
  issues: string[];
  maintainer: string;
  maintainerURL: string;
  name: string;
}

interface Stage1Output {
  lastUpdate: string;
  modules: Stage1Module[];
}

let ownModuleListPath = "./ownModuleList.json";
if (!fs.existsSync(ownModuleListPath)) {
  ownModuleListPath = "./ownModuleList_sample.json";
  console.error("No ownModuleList.json found. Using ownModuleList_sample.json");
}
const ownModuleList = JSON.parse(fs.readFileSync(ownModuleListPath, "utf8")) as OwnModuleInput[];

function sortByNameIgnoringPrefix(a: Stage1Module, b: Stage1Module): number {
  const nameA = a.name.replace("MMM-", "");
  const nameB = b.name.replace("MMM-", "");
  return nameA.localeCompare(nameB);
}

function createModuleList(): void {
  const moduleList: Stage1Module[] = [];
  ownModuleList.forEach((module) => {
    const normalized: Stage1Module = {
      ...module,
      issues: [],
      id: module.url
      .replace("https://github.com/", "")
      .replace("https://gitlab.com/", ""),

      maintainer: module.url.split("/")[3] || "",
      name: module.url.split("/")[4] || "",
      maintainerURL: "",
      description: typeof module.description === "string" ? module.description : ""
    };

    moduleList.push(normalized);
  });

  const sortedModuleList = moduleList.sort(sortByNameIgnoringPrefix);
  const data: Stage1Output = {
    lastUpdate: new Date().toISOString(),
    modules: sortedModuleList
  };

  fs.writeFileSync(
    "./website/data/modules.stage.1.json",
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

createModuleList();
