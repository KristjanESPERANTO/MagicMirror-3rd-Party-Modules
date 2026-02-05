// @ts-nocheck
/**
 * Single Worker Prototype (P7.2)
 *
 * Merges Stage 3 (clone) + Stage 4 (enrich) + Stage 5 (analyze) logic
 * into a single `processModule()` function.
 *
 * This module contains the core logic for processing a single module,
 * which will be used by worker processes in P7.3.
 */

import { ensureDirectory, fileExists } from "../../scripts/shared/fs-utils.js";
import { ensureRepository, getCommitDate } from "../../scripts/shared/git.js";
import { rename, rm } from "node:fs/promises";
import { createDeterministicImageName } from "../../scripts/shared/deterministic-output.js";
import { createLogger } from "../../scripts/shared/logger.js";
import fs from "node:fs";
import normalizeData from "normalize-package-data";
import path from "node:path";
import sharp from "sharp";

const logger = createLogger({ name: "worker" });

/*
 * ============================================================================
 * Type Definitions (JSDoc)
 * ============================================================================
 */

/**
 * @typedef {Object} ModuleInput
 * @property {string} name
 * @property {string} maintainer
 * @property {string} url
 * @property {string} [branch]
 * @property {string} [description]
 * @property {string} id
 * @property {number} [stars]
 * @property {string} [lastCommit]
 * @property {string} [license]
 * @property {boolean} [isArchived]
 * @property {boolean} [hasGithubIssues]
 * @property {string[]} [issues]
 */

/**
 * @typedef {Object} ProcessModuleConfig
 * @property {string} projectRoot
 * @property {string} modulesDir
 * @property {string} modulesTempDir
 * @property {string} imagesDir
 * @property {boolean} cacheEnabled
 * @property {Object} [checkGroups]
 * @property {boolean} [checkGroups.fast]
 * @property {boolean} [checkGroups.deep]
 * @property {boolean} [checkGroups.eslint]
 * @property {boolean} [checkGroups.ncu]
 * @property {number} [timeoutMs]
 * @property {Object} [moduleLogger] - Per-module logger instance
 */

/**
 * @typedef {Object} ModuleResult
 * @property {string} name
 * @property {string} maintainer
 * @property {string} id
 * @property {string} url
 * @property {string} [description]
 * @property {'success'|'skipped'|'failed'} status
 * @property {string} [skippedReason]
 * @property {string} [failurePhase]
 * @property {string} [error]
 * @property {boolean} cloned
 * @property {string} [cloneDir]
 * @property {string} [branch]
 * @property {PackageJsonInfo} [packageJson]
 * @property {string} [image]
 * @property {string[]} [tags]
 * @property {string} [license]
 * @property {string[]} issues
 * @property {string[]} [recommendations]
 * @property {number} [stars]
 * @property {string} [lastCommit]
 * @property {boolean} [isArchived]
 * @property {boolean} [hasGithubIssues]
 * @property {number} processingTimeMs
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} PackageJsonInfo
 * @property {string} path
 * @property {'parsed'|'missing'|'error'} status
 * @property {Object} [summary]
 * @property {string[]} [warnings]
 * @property {string} [error]
 */

/*
 * Removed old interface declarations
 */

/*
 * ============================================================================
 * Stage 3: Clone Repository
 * ============================================================================
 */

/**
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function cloneModule(module, config) {
  const identifier = `${module.name}-----${module.maintainer}`;
  const tempPath = path.join(config.modulesTempDir, identifier);
  const finalPath = path.join(config.modulesDir, identifier);

  const branch
    = typeof module.branch === "string" && module.branch.length > 0
      ? module.branch
      : null;

  try {
    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Starting clone stage", {
        url: module.url,
        branch: branch || "default"
      });
    }

    // Optimization: Check if we can skip cloning based on lastCommit date
    if (module.lastCommit && await fileExists(finalPath)) {
      try {
        const localDateStr = await getCommitDate({ cwd: finalPath });
        if (localDateStr) {
          const localDate = new Date(localDateStr);
          const remoteDate = new Date(module.lastCommit);

          // If local repo is at least as new as the remote info we have, skip clone
          if (localDate.getTime() >= remoteDate.getTime() - 60000) {
            logger.debug(`Skipping clone for ${module.name}: Local repo is up to date`);
            if (config.moduleLogger) {
              await config.moduleLogger.info("clone", "Skipped - local repo is up to date", {
                localCommit: localDateStr,
                remoteCommit: module.lastCommit
              });
            }
            return { success: true };
          }
        }
      }
      catch (dateError) {
        logger.debug(`Could not verify local commit date for ${module.name}, proceeding with clone: ${dateError.message || String(dateError)}`);
        if (config.moduleLogger) {
          await config.moduleLogger.debug("clone", "Could not verify local commit date, proceeding with clone", {
            error: dateError.message || String(dateError)
          });
        }
      }
    }

    // Clone or update the repository
    await ensureRepository({
      repositoryUrl: module.url,
      directoryPath: tempPath,
      branch,
      depth: 1
    });

    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Repository cloned successfully");
    }

    // Move from temp to final location
    await ensureDirectory(path.dirname(finalPath));
    if (await fileExists(finalPath)) {
      await rm(finalPath, { recursive: true, force: true });
    }
    await rename(tempPath, finalPath);

    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Moved to final location", {
        path: finalPath
      });
    }

    return { success: true };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Clone failed for ${module.name}: ${message}`);

    if (config.moduleLogger) {
      await config.moduleLogger.error("clone", `Clone failed: ${message}`, {
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
    }

    // Clean up temp directory
    await rm(tempPath, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });

    return { success: false, error: message };
  }
}

/*
 * ============================================================================
 * Stage 4: Enrich with Package.json and Images
 * ============================================================================
 */

/**
 * @param {string} filename
 * @returns {boolean}
 */
function isImageFile(filename) {
  return (/\.(bmp|gif|jpg|jpeg|png|webp)$/iu).test(filename);
}

/**
 * @param {string} moduleName
 * @param {string} moduleMaintainer
 * @param {ProcessModuleConfig} config
 * @returns {Promise<{targetImageName: string | null, issues: string[]}>}
 */
async function findAndResizeImage(moduleName, moduleMaintainer, config) {
  const sourceFolder = path.join(
    config.modulesDir,
    `${moduleName}-----${moduleMaintainer}`
  );

  try {
    const files = await fs.promises.readdir(sourceFolder, { recursive: true });
    files.sort();

    const issues = [];
    let firstScreenshotImage = null;
    let firstImage = null;

    for (const file of files) {
      if (isImageFile(file)) {
        const lowerFile = file.toLowerCase();
        if (
          lowerFile.includes("screenshot")
          || lowerFile.includes("example")
          || lowerFile.includes("sample")
          || lowerFile.includes("preview")
        ) {
          firstScreenshotImage = file;
          break;
        }
        else if (!firstImage) {
          firstImage = file;
        }
      }
    }

    const imageToProcess = firstScreenshotImage || firstImage;

    if (imageToProcess) {
      const targetImageName = createDeterministicImageName(
        moduleName,
        moduleMaintainer,
        "webp"
      );
      const sourcePath = path.join(sourceFolder, imageToProcess);
      const targetPath = path.join(config.imagesDir, targetImageName);

      try {
        await sharp(sourcePath)
          .resize(500, 600, {
            fit: sharp.fit.inside,
            withoutEnlargement: true
          })
          .webp({ quality: 85 })
          .toFile(targetPath);

        return { targetImageName, issues };
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`Error processing image "${imageToProcess}": ${message}`);
        return { targetImageName: null, issues };
      }
    }
    else {
      issues.push("No image found.");
      return { targetImageName: null, issues };
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      targetImageName: null,
      issues: [`Error reading module directory for images: ${message}`]
    };
  }
}

/**
 * @param {unknown} value
 * @returns {Record<string, string> | null}
 */
function sanitizeStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(([, val]) => typeof val === "string" && val.length > 0);
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries);
}

/**
 * @param {unknown} value
 * @returns {string[] | null}
 */
function sanitizeKeywordArray(value) {
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
    .filter(entry => entry.length > 0);

  return keywords.length > 0 ? keywords : null;
}

function buildPackageSummary(packageData) {
  const summary = {};

  if (typeof packageData.name === "string" && packageData.name.length > 0) {
    summary.name = packageData.name;
  }

  if (
    typeof packageData.version === "string"
    && packageData.version.length > 0
  ) {
    summary.version = packageData.version;
  }

  if (
    typeof packageData.description === "string"
    && packageData.description.length > 0
  ) {
    summary.description = packageData.description;
  }

  const keywords = sanitizeKeywordArray(packageData.keywords);
  if (keywords) {
    summary.keywords = keywords;
  }

  if (
    typeof packageData.license === "string"
    && packageData.license.length > 0
  ) {
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

/**
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<PackageJsonInfo>}
 */
async function loadPackageManifest(module, config) {
  const relativePath = path.join(
    config.modulesDir,
    `${module.name}-----${module.maintainer}`,
    "package.json"
  );

  let raw;
  try {
    raw = await fs.promises.readFile(relativePath, "utf8");
  }
  catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: relativePath,
        status: "missing",
        warnings: []
      };
    }

    return {
      path: relativePath,
      status: "error",
      warnings: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  }
  catch (error) {
    return {
      path: relativePath,
      status: "error",
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
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }

  return {
    path: relativePath,
    status: "parsed",
    summary: buildPackageSummary(parsed),
    warnings
  };
}

/**
 * @param {string[]} keywords
 * @param {string[]} issues
 * @returns {string[] | null}
 */
function deriveTagsFromKeywords(keywords, issues) {
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
    issues.push(`There are duplicates in the keywords in your package.json: ${duplicates.join(", ")}`);
  }

  let processed = keywords
    .map((tag) => {
      const lowered = tag.toLowerCase();
      if (lowered === "smarthome") {
        issues.push("Please use 'smart home' instead of 'smarthome' as a keyword in your package.json.");
        return "smart home";
      }
      if (lowered === "sport") {
        return "sports";
      }
      return lowered;
    })
    .filter(tag => !tagsToRemove.includes(tag));

  if (
    processed.some(tag =>
      ["image", "images", "pictures", "livestream", "photos", "video"].includes(tag))
  ) {
    processed.push("media");
  }

  processed = [...new Set(processed)];

  if (processed.length === 0) {
    issues.push("There are no specific keywords in 'package.json'. We would use them as tags on the module list page. Add a few meaningful terms to the keywords in the package.json. Not just \"magicmirror\" or \"module\".");
    return null;
  }

  return processed;
}

/**
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<{packageJson: PackageJsonInfo, tags?: string[], image?: string, license?: string, enrichIssues: string[]}>}
 */
async function enrichModule(module, config) {
  const enrichIssues = [];

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Starting enrichment stage");
  }

  // Load package.json
  const packageJson = await loadPackageManifest(module, config);

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Loaded package.json", {
      status: packageJson.status,
      hasKeywords: packageJson.summary?.keywords?.length > 0
    });
  }

  let tags;
  let imageName;
  let effectiveLicense = module.license;

  // Process package.json if parsed successfully
  if (packageJson.status === "parsed") {
    // Add warnings as issues
    for (const warning of packageJson.warnings || []) {
      enrichIssues.push(`\`package.json\` issue: ${warning}`);
    }

    // Derive tags from keywords
    const summaryKeywords = packageJson.summary?.keywords || [];
    if (summaryKeywords.length > 0) {
      const derivedTags = deriveTagsFromKeywords(summaryKeywords, enrichIssues);
      if (derivedTags && derivedTags.length > 0) {
        tags = derivedTags;
        if (config.moduleLogger) {
          await config.moduleLogger.info("enrich", "Derived tags from keywords", {
            tags: derivedTags
          });
        }
      }
    }
    else {
      enrichIssues.push("There are no keywords in 'package.json'. We would use them as tags on the module list page.");
    }

    // Check license consistency
    const packageLicense = packageJson.summary?.license;
    if (packageLicense && packageLicense !== "NOASSERTION") {
      if (!module.license) {
        effectiveLicense = packageLicense;
      }
      else if (!packageLicense.includes(module.license)) {
        enrichIssues.push(`Issue: The license in the package.json (${packageLicense}) doesn't match the license file (${module.license}).`);
      }
    }
  }
  else if (packageJson.status === "missing") {
    // Special case for mmpm
    if (module.name === "mmpm") {
      // Mmpm doesn't have a package.json, but we add some keywords manually
      tags = ["package manager", "module installer"];
    }
    else {
      enrichIssues.push("There is no `package.json`. We need this file to gather information about the module for the module list page.");
    }
  }
  else if (packageJson.status === "error") {
    enrichIssues.push(`An error occurred while getting information from 'package.json': ${packageJson.error}`);
  }

  // Check GitHub issues
  if (module.url.includes("github.com") && module.hasGithubIssues === false) {
    enrichIssues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
  }

  // Process images only if we have a compatible license
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

  if (effectiveLicense && useableLicenses.includes(effectiveLicense)) {
    if (config.moduleLogger) {
      await config.moduleLogger.info("enrich", "Processing image", {
        license: effectiveLicense
      });
    }

    const { targetImageName, issues: imageIssues } = await findAndResizeImage(
      module.name,
      module.maintainer,
      config
    );
    if (targetImageName) {
      imageName = targetImageName;
      if (config.moduleLogger) {
        await config.moduleLogger.info("enrich", "Image processed successfully", {
          imageName: targetImageName
        });
      }
    }
    enrichIssues.push(...imageIssues);
  }
  else if (effectiveLicense) {
    enrichIssues.push("No compatible or wrong license field in 'package.json' or LICENSE file. Without that, we can't use an image.");
    if (config.moduleLogger) {
      await config.moduleLogger.warn("enrich", "Incompatible license - skipping image", {
        license: effectiveLicense
      });
    }
  }

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Enrichment complete", {
      tagsCount: tags?.length || 0,
      hasImage: Boolean(imageName),
      issuesCount: enrichIssues.length
    });
  }

  return {
    packageJson,
    tags,
    image: imageName,
    license: effectiveLicense,
    enrichIssues
  };
}

/*
 * ============================================================================
 * Stage 5: Analyze (Placeholder)
 * ============================================================================
 */

/**
 * Placeholder for future Stage 5 analysis integration
 * Will include checks like ESLint, npm-check-updates, dependency detection, etc.
 *
 * @returns {{analysisIssues: string[], recommendations: string[]}}
 */
function analyzeModule() {
  return {
    analysisIssues: [],
    recommendations: []
  };
}

/*
 * ============================================================================
 * Main: Process Single Module
 * ============================================================================
 */

/**
 * Process a single module through all stages:
 * 1. Clone repository (Stage 3)
 * 2. Enrich with package.json and images (Stage 4)
 * 3. Analyze and run checks (Stage 5 - placeholder)
 *
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<ModuleResult>}
 */
export async function processModule(module, config) {
  const startTime = Date.now();
  const allIssues = [...module.issues || []];

  logger.info(`Processing ${module.name} by ${module.maintainer}`);

  if (config.moduleLogger) {
    await config.moduleLogger.info("start", "Module processing started", {
      name: module.name,
      maintainer: module.maintainer,
      url: module.url
    });
  }

  // Stage 3: Clone
  const cloneResult = await cloneModule(module, config);
  if (!cloneResult.success) {
    const processingTime = Date.now() - startTime;

    if (config.moduleLogger) {
      await config.moduleLogger.error("end", "Module processing failed at clone stage", {
        processingTimeMs: processingTime,
        error: cloneResult.error
      });
      await config.moduleLogger.close();
    }

    return {
      name: module.name,
      maintainer: module.maintainer,
      id: module.id,
      url: module.url,
      description: module.description,
      status: "failed",
      failurePhase: "clone",
      error: cloneResult.error,
      cloned: false,
      issues: allIssues,
      processingTimeMs: processingTime,
      fromCache: false
    };
  }

  const cloneDir = path.join(
    config.modulesDir,
    `${module.name}-----${module.maintainer}`
  );

  // Stage 4: Enrich
  let enrichResult;
  try {
    enrichResult = await enrichModule(module, config);
    allIssues.push(...enrichResult.enrichIssues);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const processingTime = Date.now() - startTime;

    if (config.moduleLogger) {
      await config.moduleLogger.error("end", "Module processing failed at enrich stage", {
        processingTimeMs: processingTime,
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
      await config.moduleLogger.close();
    }

    return {
      name: module.name,
      maintainer: module.maintainer,
      id: module.id,
      url: module.url,
      description: module.description,
      status: "failed",
      failurePhase: "enrich",
      error: message,
      cloned: true,
      cloneDir,
      issues: allIssues,
      processingTimeMs: processingTime,
      fromCache: false
    };
  }

  // Stage 5: Analyze (placeholder)
  let analysisResult;
  try {
    if (config.moduleLogger) {
      await config.moduleLogger.info("analyze", "Starting analysis stage");
    }

    analysisResult = await analyzeModule(module, config);
    allIssues.push(...analysisResult.analysisIssues);

    if (config.moduleLogger) {
      await config.moduleLogger.info("analyze", "Analysis complete", {
        issuesCount: analysisResult.analysisIssues.length,
        recommendationsCount: analysisResult.recommendations.length
      });
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (config.moduleLogger) {
      await config.moduleLogger.error("end", "Module processing failed at analyze stage", {
        processingTimeMs: Date.now() - startTime,
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
      await config.moduleLogger.close();
    }

    return {
      name: module.name,
      maintainer: module.maintainer,
      id: module.id,
      url: module.url,
      description: module.description,
      status: "failed",
      failurePhase: "analyze",
      error: message,
      cloned: true,
      cloneDir,
      packageJson: enrichResult.packageJson,
      tags: enrichResult.tags,
      image: enrichResult.image,
      license: enrichResult.license,
      issues: allIssues,
      processingTimeMs: Date.now() - startTime,
      fromCache: false
    };
  }

  const processingTime = Date.now() - startTime;

  if (config.moduleLogger) {
    await config.moduleLogger.info("end", "Module processing completed successfully", {
      processingTimeMs: processingTime,
      totalIssues: allIssues.length,
      status: "success"
    });
    await config.moduleLogger.close();
  }

  return {
    name: module.name,
    maintainer: module.maintainer,
    id: module.id,
    url: module.url,
    description: module.description,
    status: "success",
    cloned: true,
    cloneDir,
    branch: module.branch,
    packageJson: enrichResult.packageJson,
    tags: enrichResult.tags,
    image: enrichResult.image,
    license: enrichResult.license,
    issues: allIssues,
    recommendations: analysisResult.recommendations,
    stars: module.stars,
    lastCommit: module.lastCommit,
    isArchived: module.isArchived,
    hasGithubIssues: module.hasGithubIssues,
    processingTimeMs: processingTime,
    fromCache: false
  };
}
