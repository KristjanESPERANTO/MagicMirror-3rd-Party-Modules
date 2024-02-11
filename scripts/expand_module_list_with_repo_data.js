import fs from "fs";
import normalizeData from "normalize-package-data";
import sharp from "sharp";

const imagesFolder = "./docs/images";

function getJson (filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(data);
  return json;
}

function isImageFile (filename) {
  return (/\.(bmp|gif|jpg|jpeg|png|webp)$/iu).test(filename);
}

async function findAndResizeImage (moduleName, moduleMaintainer) {
  const sourceFolder = `./modules/${moduleName}-----${moduleMaintainer}/`;
  const files = await fs.promises.readdir(sourceFolder, {"recursive": true});
  files.sort();
  let imageToProcess = null;
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

  imageToProcess = firstScreenshotImage || firstImage;

  if (imageToProcess) {
    targetImageName = imageToProcess
      .replaceAll("/", "-")
      .replace("bmp", "jpg")
      .replace("gif", "jpg")
      .replace("jepg", "jpg")
      .replace("png", "jpg")
      .replace("webp", "jpg");
    const sourcePath = `${sourceFolder}/${imageToProcess}`;
    const targetPath = `${imagesFolder}/${moduleName}---${moduleMaintainer}---${targetImageName}`;

    await sharp(sourcePath).resize(300)
      .toFile(targetPath);
  } else {
    issues.push("No image found.");
  }
  return {targetImageName, issues};
}

// Gather information from package.json
async function addInformationFromPackageJson (moduleList) {
  for (const module of moduleList) {
    console.log(`+++ ${module.name} by ${module.maintainer}`);
    try {
      // Get package.json
      const filePath = `./modules/${module.name}-----${module.maintainer}/package.json`;
      const moduleData = await getJson(filePath);

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

        if (module.tags.length === 0) {
          delete module.tags;
          module.issues.push("There are no specific keywords in 'package.json'. We would use them as tags on the module list page. Add a few meaningful terms to the keywords in the package.json. Not just “magicmirror” or “module”.");
        }
      } else {
        module.issues.push("There are no keywords in 'package.json'. We would use them as tags on the module list page.");
      }

      if (moduleData.license) {
        // Add license info to the module information
        module.license = moduleData.license;

        // Use license information to determain if we can use an image
        const useableLicenses = [
          "AGPL-3.0",
          "AGPL-3.0-or-later",
          "Apache-2.0",
          "BSD-3-Clause",
          "GPL-3.0",
          "GPL-3.0-only",
          "GPL-3.0-or-later",
          "ISC",
          "MIT",
          "MPL-2.0",
          "LGPL-2.1-only"
        ];
        if (useableLicenses.includes(moduleData.license)) {
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
          module.issues.push("No compatible or wrong license field in 'package.json'. Without that, we can't use an image.");
        }
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        module.issues.push("There is no `package.json`. We need this file to gather information about the module for the module list page.");
      } else {
        module.issues.push(`An error occurred while getting information from 'package.json': ${error}`);
      }
    }
  }
  return moduleList;
}

async function expandModuleList () {
  const moduleList = await getJson("./docs/data/modules.stage.2.json");

  const expandedModuleList = await addInformationFromPackageJson(moduleList);

  fs.writeFileSync(
    "./docs/data/modules.stage.3.json",
    JSON.stringify(expandedModuleList, null, 2),
    "utf8"
  );
}

/*
 * Remove old images before creating new ones
 */
async function purgeImageFolder () {
  await fs.promises.rm(imagesFolder, {"recursive": true});
  await fs.promises.mkdir(imagesFolder);
}

purgeImageFolder();

expandModuleList();
