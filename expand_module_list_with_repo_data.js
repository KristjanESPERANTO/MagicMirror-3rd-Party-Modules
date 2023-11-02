import fs from "fs";
import normalizeData from "normalize-package-data";
import sharp from "sharp";

const imagesFolder = "./docs/images";

async function getJson(filePath) {
  const data = await fs.promises.readFile(filePath, "utf8");
  const json = JSON.parse(data);
  return json;
}

function isImageFile(filename) {
  return /\.(bmp|gif|jpg|jpeg|png|webp)$/i.test(filename);
}

async function findAndResizeImage(moduleName, moduleMaintainer) {
  const sourceFolder = `./modules/${moduleName}-----${moduleMaintainer}/`;
  const files = await fs.promises.readdir(sourceFolder, { recursive: true });
  let imageToProcess = null;
  let targetImageName = null;
  const issues = [];

  let firstScreenshotImage = null;
  let firstImage = null;

  for (const file of files) {
    if (
      (file.toLowerCase().startsWith("screenshot") && isImageFile(file)) ||
      (file.toLowerCase().startsWith("example") && isImageFile(file))
    ) {
      firstScreenshotImage = file;
      break;
    } else if (isImageFile(file) && !firstImage) {
      firstImage = file;
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

    await sharp(sourcePath).resize(300).toFile(targetPath);
  } else {
    issues.push("Issue: No image found.");
  }
  return { targetImageName, issues };
}

// Gather information from package.json
async function addInformationFromPackageJson(moduleList) {
  for (const module of moduleList) {
    console.log(`+++ Module: ${module.name} by ${module.maintainer}`);
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

      // Remove superflues tags
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
          "GPL-3.0-or-later",
          "ISC",
          "MIT"
        ];
        if (useableLicenses.includes(moduleData.license)) {
          const { targetImageName, issues } = await findAndResizeImage(
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
          module.issues.push(
            `Issue: No compatible or wrong license field in 'package.json'. Without that, we can't use an image.`
          );
        }
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        module.issues.push(
          "Issue: There is no `package.json`. We need this file to gather information about the module."
        );
      } else {
        module.issues.push(
          `Issue: An error occurred while getting information from 'package.json': ${error}`
        );
      }
    }
  }
  return moduleList;
}

async function expandModuleList() {
  const moduleList = await getJson("./docs/modules.temp.1.json");

  const expandedModuleList = await addInformationFromPackageJson(moduleList);

  fs.writeFileSync(
    "./docs/modules.temp.2.json",
    JSON.stringify(expandedModuleList, null, 2),
    "utf8"
  );
}

/*
 * Remove old images before creating new ones
 */
async function purgeImageFolder() {
  await fs.promises.rm(imagesFolder, { recursive: true });
  await fs.promises.mkdir(imagesFolder);
}

purgeImageFolder();

expandModuleList();
