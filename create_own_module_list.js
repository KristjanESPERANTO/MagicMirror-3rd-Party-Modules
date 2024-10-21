import fs from "node:fs";

let ownModuleListPath = "./ownModuleList.json";
if (!fs.existsSync(ownModuleListPath)) {
  ownModuleListPath = "./ownModuleList_sample.json";
  console.error("No ownModuleList.json found. Using ownModuleList_sample.json");
}
const ownModuleList = JSON.parse(fs.readFileSync(ownModuleListPath));

// eslint-disable-next-line @stylistic/space-before-function-paren
function sortByNameIgnoringPrefix(a, b) {
  const nameA = a.name.replace("MMM-", "").replace("EXT-", "");
  const nameB = b.name.replace("MMM-", "").replace("EXT-", "");
  return nameA.localeCompare(nameB);
}

function createModuleList () {
  const moduleList = [];
  ownModuleList.forEach((module) => {
    module.issues = [];
    module.id = module.url
      .replace("https://github.com/", "")
      .replace("https://gitlab.com/", "");

    module.maintainer = module.url.split("/")[3];
    module.name = module.url.split("/")[4];
    module.maintainerURL = "";
    if (typeof module.description === "undefined") {
      module.description = "";
    }

    moduleList.push(module);
  });

  const sortedModuleList = moduleList.sort(sortByNameIgnoringPrefix);
  const data = {
    "lastUpdate": new Date().toISOString(),
    "modules": sortedModuleList
  };

  fs.writeFileSync(
    "./docs/data/modules.stage.1.json",
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

createModuleList();
