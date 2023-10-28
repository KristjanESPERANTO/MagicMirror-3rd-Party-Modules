const fs = require("fs");
const fsp = require("fs").promises;
const normalizeData = require("normalize-package-data");

function readJsonAsync(filePath) {
  const moduleData = require(filePath);
  const issues = [];
  const warnFn = (msg) => {
    if (!msg.includes("No README data")) {
      issues.push(`- W - package.json issue: ${msg}`);
    }
  };
  normalizeData(moduleData, warnFn);
  return { moduleData, issues };
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
      const { moduleData, issues } = await readJsonAsync(
        `./modules/${module.name}-----${module.maintainer}/package.json`
      );

      for (const issue of issues) {
        module.issues.push(issue);
      }

      if (moduleData && moduleData.keywords) {
        const tagsToRemove = [
          "2",
          "magic",
          "magicmirror",
          "magicmirror2",
          "magic mirror",
          "magic mirror 2",
          "mirror",
          "mmm",
          "module",
          "nodejs",
          "smart",
          "smart mirror"
        ];

        module.tags = moduleData.keywords
          .map((tag) => tag.toLowerCase())
          .filter((tag) => !tagsToRemove.includes(tag));
      }
      if (module.license) {
        module.license = moduleData.license;
      }
    } catch (error) {
      if (error.message.includes("Cannot find module")) {
        module.issues.push(
          `- W - There is no 'package.json'. We need this file to gather information about the module.`
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
