const fs = require("fs");
const fsp = require("fs").promises;
const readJson = require("read-package-json");

function readJsonAsync(filePath) {
  return new Promise((resolve, reject) => {
    readJson(filePath, false, true, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

async function getModuleList() {
  const data = await fsp.readFile(`modules.json`, "utf8");
  const json = JSON.parse(data);
  return json;
}

async function addInformationFromPackageJson(moduleList) {
  for (const module of moduleList) {
    // Gather information from package.json
    console.log(`### Module: ${module.name} by ${module.maintainer}`);
    try {
      const moduleData = await readJsonAsync(
        `./modules/${module.name}-----${module.maintainer}/package.json`
      );

      if (moduleData && moduleData.keywords) {
        module.tags = moduleData.keywords.map((tag) => tag.toLowerCase());
      }
      if (module.license) {
        module.license = moduleData.license;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        module.issues.push(
          "- W - There is no 'package.json'. We need this file to gather information about the module."
        );
      } else {
        module.issues.push(
          `- W - An error occurred while getting information from 'package.json': ${error}`
        );
      }
    }
  }
  return moduleList;
}

async function expandModuleList() {
  const moduleList = await getModuleList();

  const expandedModuleList = await addInformationFromPackageJson(moduleList);

  fs.writeFileSync(
    "modules_expanded.json",
    JSON.stringify(expandedModuleList, null, 2),
    "utf8"
  );
}

expandModuleList();
