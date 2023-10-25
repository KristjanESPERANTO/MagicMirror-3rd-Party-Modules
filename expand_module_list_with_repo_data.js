const fs = require("fs");
const fsp = require("fs").promises;

async function getModuleList() {
  const data = await fsp.readFile(`modules.json`, "utf8");
  const json = JSON.parse(data);
  return json;
}

async function getModuleData(maintainer, name) {
  console.log(`##### ${name} ${maintainer}`);

  const data = await fsp.readFile(
    `./modules/${name}-----${maintainer}/package.json`,
    "utf8"
  );
  const json = JSON.parse(data);

  return json;
}

async function expandModuleList() {
  const moduleList = await getModuleList();

  for (const module of moduleList) {
    console.log(module);

    // Gather Information from package.json
    try {
      // eslint-disable-next-line no-await-in-loop
      const moduleData = await getModuleData(module.maintainer, module.name);
      if (moduleData.keywords) {
        module.tags = moduleData.keywords.map((tag) => tag.toLowerCase());
      }
      if (module.license) {
        module.license = moduleData.license;
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        module.issues.push("- E - An error occurred parsing 'package.json'.");
      } else if (error.code === "ENOENT") {
        module.issues.push(
          "- W - There is no 'package.json'. We need this file to gather information about the module."
        );
      } else {
        module.issues.push(
          `- E - An error occurred while getting information from 'package.json': ${error}`
        );
      }
    }
  }

  fs.writeFileSync(
    "modules_expanded.json",
    JSON.stringify(moduleList, null, 2),
    "utf8"
  );
}

expandModuleList();
