import fs from "node:fs";
import {getJson} from "./utils.js";
import normalizeData from "normalize-package-data";
import sharp from "sharp";
import {validateStageData} from "./lib/schemaValidator.js";

const imagesFolder = "./website/images";

function isImageFile (filename) {
  return (/\.(bmp|gif|jpg|jpeg|png|webp)$/iu).test(filename);
}

async function findAndResizeImage (moduleName, moduleMaintainer) {
  const sourceFolder = `./modules/${moduleName}-----${moduleMaintainer}/`;
  const files = await fs.promises.readdir(sourceFolder, {recursive: true});
  files.sort();
  let targetImageName = null;
  const issues = [];

  let firstScreenshotImage = null;
  let firstImage = null;

  for (const file of files) {
    if (isImageFile(file)) {
      if (
        file.toLowerCase().includes("screenshot") ||
        file.toLowerCase().includes("example") ||
        file.toLowerCase().includes("sample") ||
        file.toLowerCase().includes("preview")
      ) {
        firstScreenshotImage = file;
        break;
      } else if (!firstImage) {
        firstImage = file;
      }
    }
  }

  const imageToProcess = firstScreenshotImage || firstImage;

  if (imageToProcess) {
    targetImageName = imageToProcess
      .replaceAll("/", "-")
      .replace(/bmp|gif|jpeg|jpg|png|webp/giu, "jpg");
    const sourcePath = `${sourceFolder}/${imageToProcess}`;
    const targetPath = `${imagesFolder}/${moduleName}---${moduleMaintainer}---${targetImageName}`;

    try {
      await sharp(sourcePath)
        .resize(
          500,
          600,
          {
            fit: sharp.fit.inside,
            withoutEnlargement: true
          }
        )
        .toFile(targetPath);
    } catch (error) {
      issues.push(`Error processing image "${imageToProcess}": ${error.message}`);
    }
  } else {
    issues.push("No image found.");
  }
  return {targetImageName, issues};
}

// Gather information from package.json
async function addInformationFromPackageJson (moduleList) {
  for (const module of moduleList) {
    console.log(`+++ ${module.name} by ${module.maintainer}`);
    let moduleData = {};
    try {
      // Get package.json
      const filePath = `./modules/${module.name}-----${module.maintainer}/package.json`;
      moduleData = await getJson(filePath);

      // Normalize package.json
      const warnFn = (msg) => {
        if (!msg.includes("No README data")) {
          module.issues.push(`\`package.json\` issue: ${msg}`);
        }
      };
      normalizeData(moduleData, warnFn);

      // Remove superfluous tags
      if (moduleData.keywords) {
        const tagsToRemove = [
          "2",
          "mm",
          "mm2",
          "magic",
          "magicmirror",
          "magicmirror2",
          "magicmirror²",
          "magic mirror",
          "magic mirror 2",
          "magic-mirror",
          "magic mirror module",
          "magicmirror-module",
          "mirror",
          "mmm",
          "module",
          "nodejs",
          "smart",
          "smart mirror"
        ];

        module.tags = moduleData.keywords;

        const duplicates = module.tags.filter((tag, index) => module.tags.indexOf(tag) !== index);
        if (duplicates.length > 0) {
          module.issues.push(`There are duplicates in the keywords in your package.json: ${duplicates.join(", ")}`);
        }

        module.tags = module.tags
          .map((tag) => {
            tag = tag.toLowerCase();
            if (tag === "smarthome") {
              module.issues.push("Please use 'smart home' instead of 'smarthome' as a keyword in your package.json.");
              return "smart home";
            }
            if (tag === "sport") {
              return "sports";
            }
            return tag;
          })
          .filter((tag) => !tagsToRemove.includes(tag));

        if (module.tags.some((tag) => ["image", "images", "pictures", "livestream", "photos", "video"].includes(tag))) {
          module.tags.push("media");
        }
        // Remove duplicates
        module.tags = [...new Set(module.tags)];

        if (module.tags.length === 0) {
          delete module.tags;
          module.issues.push("There are no specific keywords in 'package.json'. We would use them as tags on the module list page. Add a few meaningful terms to the keywords in the package.json. Not just “magicmirror” or “module”.");
        }
      } else {
        module.issues.push("There are no keywords in 'package.json'. We would use them as tags on the module list page.");
      }

      if (module.url.includes("github.com") && module.hasGithubIssues === false) {
        module.issues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        if (module.name === "mmpm") {
          module.keywords = ["package manager", "module installer"];
        } else {
          module.issues.push("There is no `package.json`. We need this file to gather information about the module for the module list page.");
        }

        if (module.hasGithubIssues === false) {
          module.issues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
        }
      } else {
        module.issues.push(`An error occurred while getting information from 'package.json': ${error}`);
      }
    }
    await checkLicenseAndHandleScreenshot(moduleData, module);
  }
  return moduleList;
}

async function checkLicenseAndHandleScreenshot (moduleData, module) {
  if (moduleData.license && moduleData.license !== "NOASSERTION" || module.license) {
    if (!module.license) {
      // If license info is not set from the GitHub data use the one from package.json.
      module.license = moduleData.license;
    } else if (module.license && moduleData.license && !moduleData.license.includes(module.license)) {
      // If license info exists from the GitHub data and package.json, but they don't match, add an issue.
      const issueText = `Issue: The license in the package.json (${moduleData.license}) doesn't match the license file (${module.license}).`;
      module.issues.push(issueText);
    }

    const useableLicenses = [
      "AGPL-3.0",
      "AGPL-3.0-or-later",
      "Apache-2.0",
      "BSD-3-Clause",
      "CC0-1.0",
      "GPL-2.0",
      "GPL-3.0",
      "GPL-3.0-only",
      "GPL-3.0-or-later",
      "ISC",
      "MIT",
      "MIT-Modern-Variant",
      "MPL-2.0",
      "LGPL-2.1",
      "LGPL-2.1-only",
      "Unlicense"
    ];

    // Use license information to determine if we can use an image
    if (useableLicenses.includes(module.license)) {
      const {targetImageName, issues} = await findAndResizeImage(
        module.name,
        module.maintainer
      );
      const imagePath = targetImageName;
      if (imagePath) {
        module.image = imagePath;
      }
      if (issues) {
        module.issues = [...module.issues, ...issues];
      }
    } else {
      module.issues.push("No compatible or wrong license field in 'package.json' or LICENSE file. Without that, we can't use an image.");
    }
  }
}

async function expandModuleList () {
  const moduleList = await getJson("./website/data/modules.stage.3.json");
  validateStageData("modules.stage.3", moduleList);

  await addInformationFromPackageJson(moduleList.modules);

  validateStageData("modules.stage.4", moduleList);

  fs.writeFileSync(
    "./website/data/modules.stage.4.json",
    JSON.stringify(moduleList, null, 2),
    "utf8"
  );
}

/*
 * Remove old images before creating new ones
 */
async function purgeImageFolder () {
  await fs.promises.rm(imagesFolder, {recursive: true});
  await fs.promises.mkdir(imagesFolder);
}

purgeImageFolder();

expandModuleList();
