import fs from "node:fs";
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

const PACKAGE_JSON_STATUSES = {
  parsed: "parsed",
  missing: "missing",
  error: "error"
};

function sanitizeStringRecord (value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(([, val]) => typeof val === "string" && val.length > 0);
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries);
}

function sanitizeKeywordArray (value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const keywords = value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      return "";
    })
    .filter((entry) => entry.length > 0);

  return keywords.length > 0 ? keywords : null;
}

function buildPackageSummary (packageData) {
  const summary = {};

  if (typeof packageData.name === "string" && packageData.name.length > 0) {
    summary.name = packageData.name;
  }

  if (typeof packageData.version === "string" && packageData.version.length > 0) {
    summary.version = packageData.version;
  }

  if (typeof packageData.description === "string" && packageData.description.length > 0) {
    summary.description = packageData.description;
  }

  const keywords = sanitizeKeywordArray(packageData.keywords);
  if (keywords) {
    summary.keywords = keywords;
  }

  if (typeof packageData.license === "string" && packageData.license.length > 0) {
    summary.license = packageData.license;
  }

  const scripts = sanitizeStringRecord(packageData.scripts);
  if (scripts) {
    summary.scripts = scripts;
  }

  const dependencies = sanitizeStringRecord(packageData.dependencies);
  if (dependencies) {
    summary.dependencies = dependencies;
  }

  const devDependencies = sanitizeStringRecord(packageData.devDependencies);
  if (devDependencies) {
    summary.devDependencies = devDependencies;
  }

  const peerDependencies = sanitizeStringRecord(packageData.peerDependencies);
  if (peerDependencies) {
    summary.peerDependencies = peerDependencies;
  }

  const optionalDependencies = sanitizeStringRecord(packageData.optionalDependencies);
  if (optionalDependencies) {
    summary.optionalDependencies = optionalDependencies;
  }

  const engines = sanitizeStringRecord(packageData.engines);
  if (engines) {
    summary.engines = engines;
  }

  if (typeof packageData.type === "string" && packageData.type.length > 0) {
    summary.type = packageData.type;
  }

  return summary;
}

async function loadPackageManifest ({name, maintainer}) {
  const relativePath = `./modules/${name}-----${maintainer}/package.json`;

  let raw;
  try {
    raw = await fs.promises.readFile(relativePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        path: relativePath,
        status: PACKAGE_JSON_STATUSES.missing,
        warnings: []
      };
    }

    return {
      path: relativePath,
      status: PACKAGE_JSON_STATUSES.error,
      warnings: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      path: relativePath,
      status: PACKAGE_JSON_STATUSES.error,
      warnings: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const warnings = [];
  const warnFn = (msg) => {
    if (!msg.includes("No README data")) {
      warnings.push(msg);
    }
  };

  try {
    normalizeData(parsed, warnFn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }

  return {
    path: relativePath,
    status: PACKAGE_JSON_STATUSES.parsed,
    raw,
    summary: buildPackageSummary(parsed),
    warnings
  };
}

function deriveTagsFromKeywords ({module, keywords}) {
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

  const duplicates = keywords.filter((tag, index) => keywords.indexOf(tag) !== index);
  if (duplicates.length > 0) {
    module.issues.push(`There are duplicates in the keywords in your package.json: ${duplicates.join(", ")}`);
  }

  let processed = keywords
    .map((tag) => {
      const lowered = tag.toLowerCase();
      if (lowered === "smarthome") {
        module.issues.push("Please use 'smart home' instead of 'smarthome' as a keyword in your package.json.");
        return "smart home";
      }
      if (lowered === "sport") {
        return "sports";
      }
      return lowered;
    })
    .filter((tag) => !tagsToRemove.includes(tag));

  if (processed.some((tag) => ["image", "images", "pictures", "livestream", "photos", "video"].includes(tag))) {
    processed.push("media");
  }

  processed = [...new Set(processed)];

  if (processed.length === 0) {
    module.issues.push("There are no specific keywords in 'package.json'. We would use them as tags on the module list page. Add a few meaningful terms to the keywords in the package.json. Not just “magicmirror” or “module”.");
    return null;
  }

  return processed;
}

// Gather information from package.json
async function addInformationFromPackageJson (moduleList) {
  for (const module of moduleList) {
    console.log(`+++ ${module.name} by ${module.maintainer}`);

    const manifest = await loadPackageManifest(module);
    module.packageJson = manifest;

    if (manifest.status === PACKAGE_JSON_STATUSES.parsed) {
      for (const warning of manifest.warnings) {
        module.issues.push(`\`package.json\` issue: ${warning}`);
      }

      const summaryKeywords = Array.isArray(manifest.summary?.keywords)
        ? [...manifest.summary.keywords]
        : [];

      if (summaryKeywords.length > 0) {
        const tags = deriveTagsFromKeywords({module, keywords: summaryKeywords});
        if (tags && tags.length > 0) {
          module.tags = tags;
        } else {
          delete module.tags;
        }
      } else {
        module.issues.push("There are no keywords in 'package.json'. We would use them as tags on the module list page.");
        delete module.tags;
      }
    } else if (manifest.status === PACKAGE_JSON_STATUSES.missing) {
      if (module.name === "mmpm") {
        module.keywords = ["package manager", "module installer"];
      } else {
        module.issues.push("There is no `package.json`. We need this file to gather information about the module for the module list page.");
      }
      delete module.tags;
    } else if (manifest.status === PACKAGE_JSON_STATUSES.error) {
      module.issues.push(`An error occurred while getting information from 'package.json': ${manifest.error}`);
      delete module.tags;
    }

    if (module.url.includes("github.com") && module.hasGithubIssues === false) {
      module.issues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
    }

    await checkLicenseAndHandleScreenshot(manifest, module);
  }
  return moduleList;
}

async function checkLicenseAndHandleScreenshot (packageManifest, module) {
  const packageLicenseRaw = packageManifest?.summary?.license;
  const packageLicense = typeof packageLicenseRaw === "string" && packageLicenseRaw.length > 0
    ? packageLicenseRaw
    : null;

  if (packageLicense && packageLicense !== "NOASSERTION") {
    if (!module.license) {
      module.license = packageLicense;
    } else if (!packageLicense.includes(module.license)) {
      const issueText = `Issue: The license in the package.json (${packageLicense}) doesn't match the license file (${module.license}).`;
      module.issues.push(issueText);
    }
  }

  const effectiveLicense = module.license ?? packageLicense;

  if (!effectiveLicense || effectiveLicense === "NOASSERTION") {
    return;
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
  if (useableLicenses.includes(effectiveLicense)) {
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

async function readJson (filePath) {
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function expandModuleList () {
  const moduleList = await readJson("./website/data/modules.stage.3.json");
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
