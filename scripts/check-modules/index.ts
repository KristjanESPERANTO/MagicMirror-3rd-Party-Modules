#!/usr/bin/env node
// @ts-nocheck

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { setMaxListeners } from "node:events";
import { promisify } from "node:util";

import { ensureDirectory, writeJson } from "../shared/fs-utils.js";
import { createLogger } from "../shared/logger.js";
import {
  validateStageData,
  validateStageFile
} from "../lib/schemaValidator.js";

const execFileAsync = promisify(execFile);

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const PROJECT_ROOT = path.resolve(currentDir, "..", "..");
const WEBSITE_DIR = path.join(PROJECT_ROOT, "website");
const DATA_DIR = path.join(WEBSITE_DIR, "data");
const MODULES_DIR = path.join(PROJECT_ROOT, "modules");
const RESULT_PATH = path.join(WEBSITE_DIR, "result.md");
const STAGE5_PATH = path.join(DATA_DIR, "modules.stage.5.json");
const MODULES_JSON_PATH = path.join(DATA_DIR, "modules.json");
const MODULES_MIN_PATH = path.join(DATA_DIR, "modules.min.json");
const STATS_PATH = path.join(DATA_DIR, "stats.json");

const baseLogger = createLogger();
const logger =
  typeof baseLogger.child === "function"
    ? baseLogger.child("check-modules")
    : baseLogger;

setMaxListeners(0);

if (typeof process.setMaxListeners === "function") {
  process.setMaxListeners(0);
}

function formatLocalIsoTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absMinutes / 60));
  const offsetRest = pad(absMinutes % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRest}`;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function addIssue(issues, message) {
  if (!issues.includes(message)) {
    issues.push(message);
  }
}

function formatRuleIssue(rule, fileName) {
  return `${rule.category}: Found \`${rule.pattern}\` in file \`${fileName}\`: ${rule.description}`;
}

function normalizeIssuesInput(issues) {
  if (Array.isArray(issues)) {
    return issues.slice();
  }
  if (typeof issues === "string" && issues.length > 0) {
    return [issues];
  }
  return [];
}

function getRepositoryHost(moduleUrl) {
  if (typeof moduleUrl !== "string") {
    return "unknown";
  }

  try {
    const firstSegment = moduleUrl.split(".")[0];
    const segments = firstSegment.split("/");
    return segments[2] ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function getLastCommitDate(module, moduleDir) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%aI"],
      { cwd: moduleDir }
    );
    const stamp = stdout.toString().trim();
    if (stamp.length > 0) {
      module.lastCommit = stamp;
      const lastCommitDate = new Date(stamp);
      if (!Number.isNaN(lastCommitDate.getTime())) {
        const now = new Date();
        const diffDays =
          (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 365 * 2) {
          module.defaultSortWeight += 1;
        }
      }
    }
  } catch (error) {
    logger.warn(
      `Unable to read last commit date for ${module.name}: ${error instanceof Error ? error.message : error}`
    );
  }
}

const TEXT_RULES = [
  {
    pattern: "new Buffer(",
    category: "Deprecated",
    description:
      "This is deprecated. Please update. [See here for more information](https://nodejs.org/api/buffer.html)."
  },
  {
    pattern: "fs.F_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.F_OK`."
  },
  {
    pattern: "fs.R_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.R_OK`."
  },
  {
    pattern: "fs.W_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.W_OK`."
  },
  {
    pattern: "fs.X_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.X_OK`."
  },
  {
    pattern: "Magic Mirror",
    category: "Typo",
    description: "Replace it with `MagicMirror²`."
  },
  {
    pattern: "MagicMirror2",
    category: "Typo",
    description: "Replace it with `MagicMirror²`."
  },
  {
    pattern: "[MagicMirror]",
    category: "Typo",
    description: "Replace it with `[MagicMirror²]`."
  },
  {
    pattern: "<sub>2</sub>",
    category: "Typo",
    description: "Replace it with `²`."
  },
  {
    pattern: "require(\"request\")",
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require('request')",
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require(\"request-promise\")",
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require('request-promise')",
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require(\"native-request\")",
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require(\"http\")",
    category: "Recommendation",
    description: "Replace \"http\" by \"node:http\"."
  },
  {
    pattern: "require('http')",
    category: "Recommendation",
    description: "Replace 'http' by 'node:http'."
  },
  {
    pattern: "require(\"https\")",
    category: "Recommendation",
    description: "Replace \"https\" by \"node:https\"."
  },
  {
    pattern: "require('https')",
    category: "Recommendation",
    description: "Replace 'https' by 'node:https'."
  },
  {
    pattern: "'node-fetch'",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "\"node-fetch\"",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require(\"fetch\")",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "require('fetch')",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "axios",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "omxplayer",
    category: "Deprecated",
    description: "Try to replace it with `mplayer` or `vlc`."
  },
  {
    pattern: "XMLHttpRequest",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "uses: actions/checkout@v2",
    category: "Recommendation",
    description: "Replace it with v5."
  },
  {
    pattern: "uses: actions/checkout@v3",
    category: "Recommendation",
    description: "Replace it with v5."
  },
  {
    pattern: "uses: actions/checkout@v4",
    category: "Recommendation",
    description: "Replace it with v5."
  },
  {
    pattern: "uses: actions/setup-node@v3",
    category: "Recommendation",
    description: "Replace it with v5."
  },
  {
    pattern: "uses: actions/setup-node@v4",
    category: "Recommendation",
    description: "Replace it with v5."
  },
  {
    pattern: "node-version: [14",
    category: "Deprecated",
    description: "Update to current version."
  },
  {
    pattern: "node-version: 16",
    category: "Deprecated",
    description: "Update to current version."
  },
  {
    pattern: "node-version: [16",
    category: "Deprecated",
    description: "Update to current version."
  },
  {
    pattern: "node-version: 18",
    category: "Deprecated",
    description: "Update to current version."
  },
  {
    pattern: "node-version: [18",
    category: "Deprecated",
    description: "Update to current version."
  },
  {
    pattern: "npm run",
    category: "Recommendation",
    description:
      "Replace it with `node --run`. This is a more modern way to run scripts, without the need for npm."
  },
  {
    pattern: "jshint",
    category: "Recommendation",
    description: "Replace \"jshint\" by \"eslint\"."
  },
  {
    pattern: "getYear()",
    category: "Deprecated",
    description: "Replace `getYear()` by `getFullYear()`."
  },
  {
    pattern: "MichMich/MagicMirror",
    category: "Outdated",
    description: "Replace it by `MagicMirrorOrg/MagicMirror`."
  },
  {
    pattern: "/_/husky.sh",
    category: "Outdated",
    description: "Since husky v9 you may not need this anymore."
  },
  {
    pattern: "npm install electron-rebuild",
    category: "Deprecated",
    description: "Replace it with `@electron/rebuild`"
  },
  {
    pattern: "api.openweathermap.org/data/2.5",
    category: "Deprecated",
    description:
      "OpenWeather API 2.5 is deprecated since June 2024. Please update to 3.0."
  },
  {
    pattern: "https://cdnjs.cloudflare.com",
    category: "Recommendation",
    description:
      "It looks like a package is loaded via CDN. It would be better if the package were installed locally via npm."
  },
  {
    pattern: "https://cdn.jsdelivr.net",
    category: "Recommendation",
    description:
      "It looks like a package is loaded via CDN. It would be better if the package were installed locally via npm."
  },
  {
    pattern: "eslint .",
    category: "Recommendation",
    description:
      "The period at the end of the command is not necessary since v9. It is recommended to remove it."
  },
  {
    pattern: "eslint --fix .",
    category: "Recommendation",
    description:
      "The period at the end of the command is not necessary since v9. It is recommended to remove it."
  },
  {
    pattern: "git checkout",
    category: "Recommendation",
    description:
      "Replace it with `git switch`. It's not a drop-in replacement, so make sure to check the documentation."
  }
];

const PACKAGE_JSON_RULES = [
  {
    pattern: "\"electron-rebuild\"",
    category: "Deprecated",
    description: "Replace it with `@electron/rebuild`"
  },
  {
    pattern: "eslint-config-airbnb",
    category: "Deprecated",
    description: "Replace it with modern ESLint configuration."
  },
  {
    pattern: "\"eslint-plugin-json\"",
    category: "Recommendation",
    description: "Replace it by `@eslint/json`."
  },
  {
    pattern: "eslint-plugin-jsonc",
    category: "Recommendation",
    description: "Replace it by `@eslint/json`."
  },
  {
    pattern: "\"grunt\"",
    category: "Deprecated",
    description:
      "Grunt is practically unmaintained. Move on to something better."
  },
  {
    pattern: "husky install",
    category: "Outdated",
    description: "Since husky v9 you may not need this anymore."
  },
  {
    pattern: "\"needle\"",
    category: "Recommendation",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    pattern: "rollup-plugin-banner",
    category: "Deprecated",
    description: "Replace it with built-in banner."
  },
  {
    pattern: "stylelint-config-prettier",
    category: "Deprecated",
    description: "Update `stylelint` and remove `stylelint-config-prettier`."
  }
];

const PACKAGE_LOCK_RULES = [
  {
    pattern: "\"lockfileVersion\": 1",
    category: "Deprecated",
    description: "Run `npm update` to update to lockfileVersion 3."
  },
  {
    pattern: "\"lockfileVersion\": 2",
    category: "Deprecated",
    description: "Run `npm update` to update to lockfileVersion 3."
  }
];

const README_MODULES_FALSE_POSITIVES = new Set([
  "MMM-pages",
  "MMM-WebSpeechTTS"
]);
const README_CONFIG_FALSE_POSITIVES = new Set(["MMM-CalendarExt2"]);
const README_TRAILING_COMMA_FALSE_POSITIVES = new Set([
  "MMM-MealieMenu",
  "MMM-Remote-Control"
]);

async function collectEntries(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    let dirEntries = [];
    try {
      dirEntries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `Failed to read directory ${dir}: ${error instanceof Error ? error.message : error}`
      );
      continue;
    }

    dirEntries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      const segments = relativePath.split(path.sep);

      if (segments.includes(".git")) {
        continue;
      }

      results.push({ entry, fullPath });

      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
    }
  }

  return results;
}

function pathHasNodeModules(relativePath) {
  return relativePath.split(path.sep).includes("node_modules");
}

function countNodeModulesSegments(relativePath) {
  return relativePath
    .split(path.sep)
    .filter((segment) => segment === "node_modules").length;
}

async function readTextSafely(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    logger.debug(
      `Skipping file ${filePath}: ${error instanceof Error ? error.message : error}`
    );
    return null;
  }
}

async function getBranchListing(moduleDir) {
  try {
    const { stdout } = await execFileAsync("git", ["branch"], {
      cwd: moduleDir
    });
    return stdout.toString();
  } catch (error) {
    logger.warn(
      `Failed to read branches for ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return "";
  }
}

async function runNpmCheckUpdates(moduleDir) {
  try {
    const { stdout } = await execFileAsync("npx", ["npm-check-updates"], {
      cwd: moduleDir
    });

    // Parse the formatted output lines that contain "→"
    const lines = stdout
      .split(/\r?\n/u)
      .filter((line) => line.includes("→"))
      .map((line) => line.trim());

    return lines;
  } catch (error) {
    logger.warn(
      `npm-check-updates failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

async function runDeprecatedCheck(moduleDir) {
  try {
    const { stdout, stderr } = await execFileAsync("npx", ["ndc", "current"], {
      cwd: moduleDir,
      timeout: 60_000
    });

    const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
    if (output.includes("There are no deprecated dependencies.")) {
      return null;
    }

    const lines = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.includes(":"));
    if (lines.length === 0) {
      return null;
    }
    return lines.join("\n");
  } catch (error) {
    logger.warn(
      `npm-deprecated-check failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return null;
  }
}

async function runEslintCheck(moduleDir) {
  try {
    const result = await execFileAsync(
      "npx",
      [
        "eslint",
        "--format",
        "json",
        "--config",
        "eslint.testconfig.js",
        moduleDir
      ],
      {
        cwd: PROJECT_ROOT,
        timeout: 120_000
      }
    );

    const stdout = result.stdout;
    if (!stdout) {
      return [];
    }

    const parsed = JSON.parse(stdout);
    const issues = [];
    for (const entry of parsed) {
      const relPath = entry.filePath
        ?.split(moduleDir)?.[1]
        ?.replace(/^\/+/, "");
      for (const message of entry.messages ?? []) {
        if (
          message &&
          typeof message.message === "string" &&
          !message.message.includes("Definition for rule")
        ) {
          const location = `${relPath ?? entry.filePath}: Line ${message.line}, Column ${message.column}`;
          issues.push(
            `${location}: ${message.message} (rule: ${message.ruleId})`
          );
        }
      }
    }
    return issues;
  } catch (error) {
    // ESLint returns non-zero exit code when it finds errors, but we still want the output
    if (error && typeof error === "object" && "stdout" in error) {
      try {
        const stdout = error.stdout;
        if (!stdout) {
          return [];
        }

        const parsed = JSON.parse(stdout);
        const issues = [];
        for (const entry of parsed) {
          const relPath = entry.filePath
            ?.split(moduleDir)?.[1]
            ?.replace(/^\/+/, "");
          for (const message of entry.messages ?? []) {
            if (
              message &&
              typeof message.message === "string" &&
              !message.message.includes("Definition for rule")
            ) {
              const location = `${relPath ?? entry.filePath}: Line ${message.line}, Column ${message.column}`;
              issues.push(
                `${location}: ${message.message} (rule: ${message.ruleId})`
              );
            }
          }
        }
        return issues;
      } catch (_parseError) {
        logger.warn(
          `ESLint check failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
        );
        return [];
      }
    }

    logger.warn(
      `ESLint check failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

async function applyDependencyHelpers({ moduleDir, issues }) {
  const packageJsonPath = path.join(moduleDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    return;
  }

  if (issues.length >= 4) {
    return;
  }

  const upgrades = await runNpmCheckUpdates(moduleDir);
  if (upgrades.length > 0) {
    const header = `Information: There are updates for ${upgrades.length} dependencie(s):`;
    const details = upgrades.map((entry) => `   - ${entry}`).join("\n");
    addIssue(issues, `${header}\n${details}`);
  }

  if (issues.length >= 3) {
    return;
  }

  const deprecated = await runDeprecatedCheck(moduleDir);
  if (deprecated) {
    addIssue(issues, deprecated);
  }

  if (issues.length >= 3) {
    return;
  }

  const eslintIssues = await runEslintCheck(moduleDir);
  if (eslintIssues.length > 0) {
    const body = eslintIssues.map((item) => `   - ${item}`).join("\n");
    addIssue(issues, `ESLint issues:\n${body}`);
  }
}

async function analyzeModule({ module, moduleDir, issues }) {
  const entries = await collectEntries(moduleDir);
  const allPathsString = entries.map((entry) => entry.fullPath).join(" ");

  for (const { entry, fullPath } of entries) {
    const relative = path.relative(moduleDir, fullPath);

    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" &&
        countNodeModulesSegments(relative) === 1
      ) {
        addIssue(
          issues,
          "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`."
        );
      }
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (pathHasNodeModules(relative)) {
      continue;
    }

    const lowerRelative = relative.toLowerCase();
    const fileName = entry.name;

    if (lowerRelative.includes("package-lock.json")) {
      const content = await readTextSafely(fullPath);
      if (!content) {
        continue;
      }
      for (const rule of PACKAGE_LOCK_RULES) {
        if (content.includes(rule.pattern)) {
          addIssue(issues, formatRuleIssue(rule, fileName));
        }
      }
      continue;
    }

    if (lowerRelative.includes("changelog")) {
      continue;
    }

    const content = await readTextSafely(fullPath);
    if (content == null) {
      continue;
    }

    if (fileName === "jquery.js" || fileName === "jquery.min.js") {
      addIssue(
        issues,
        `Recommendation: Found local copy of \`${fileName}\`. Instead of a local copy, it would be better to add jQuery to the dependencies in \`package.json\`.`
      );
      const versions = [
        "jQuery v3.7",
        "jQuery v3.8",
        "jQuery v3.9",
        "jQuery v4"
      ];
      if (!versions.some((needle) => content.includes(needle))) {
        addIssue(
          issues,
          `Outdated: Local jQuery file \`${fileName}\` seems to be outdated. jQuery v3.7 or higher is recommended.`
        );
      }
      continue;
    }

    for (const rule of TEXT_RULES) {
      if (content.includes(rule.pattern)) {
        addIssue(issues, formatRuleIssue(rule, fileName));
      }
    }

    if (fileName === "package.json") {
      for (const rule of PACKAGE_JSON_RULES) {
        if (content.includes(rule.pattern)) {
          addIssue(issues, formatRuleIssue(rule, fileName));
        }
      }
    }

    if (fileName.toLowerCase().includes("stylelint")) {
      if (content.includes("prettier/prettier")) {
        addIssue(
          issues,
          `Recommendation: Found \`prettier/prettier\` in file \`${fileName}\`: Config would be cleaner using 'stylelint-prettier/recommended'. [See here](https://github.com/prettier/stylelint-prettier).`
        );
      }
    }

    if (fileName === "README.md" && path.dirname(fullPath) === moduleDir) {
      if (!content.includes("## Updat")) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have an update section (like `## Update`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Update-Instructions))."
        );
      }

      if (!content.includes("## Install")) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have an install section (like `## Installation`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Installation-Instructions))."
        );
      }

      const hasModulesArray = content.includes("modules: [");
      if (hasModulesArray && !README_MODULES_FALSE_POSITIVES.has(module.name)) {
        addIssue(
          issues,
          "Recommendation: The README seems to have a modules array (Found `modules: [`). This is usually not necessary. Please remove it if it is not needed ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
        );
      }

      const configExampleRegex =
        /\{\s*[^{}]*config\s*:\s*\{[\s\S]*?\}[\s\S]*?\}/u;
      const hasConfigExample = configExampleRegex.test(content);
      if (
        !hasConfigExample &&
        !hasModulesArray &&
        !README_CONFIG_FALSE_POSITIVES.has(module.name)
      ) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have a config example. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
        );
      }

      if (hasConfigExample) {
        const trailingCommaRegex =
          /\{\s*[^{}]*config\s*:\s*\{[\s\S]*?\}[\s\S]*?\},/u;
        if (
          !trailingCommaRegex.test(content) &&
          !README_TRAILING_COMMA_FALSE_POSITIVES.has(module.name)
        ) {
          addIssue(
            issues,
            "Recommendation: The README seems to have a config example without a trailing comma. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
          );
        }
      }

      if (!content.includes("git clone")) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have clone instructions."
        );
      } else if (!content.includes(`git clone ${module.url}`)) {
        addIssue(
          issues,
          "Recommendation: The README seems to have incorrect clone instructions. Please check the URL."
        );
      }
    }
  }

  if (!allPathsString.includes("LICENSE")) {
    addIssue(
      issues,
      "Warning: No LICENSE file ([example LICENSE file](https://github.com/KristjanESPERANTO/MMM-WebSpeechTTS/blob/main/LICENSE.md))."
    );
  }

  if (!allPathsString.includes("CHANGELOG")) {
    addIssue(
      issues,
      "Recommendation: There is no CHANGELOG file. It is recommended to add one ([example CHANGELOG file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CHANGELOG.md))."
    );
  }

  if (!allPathsString.includes("CODE_OF_CONDUCT")) {
    addIssue(
      issues,
      "Recommendation: There is no CODE_OF_CONDUCT file. It is recommended to add one ([example CODE_OF_CONDUCT file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CODE_OF_CONDUCT.md))."
    );
  }

  if (
    !allPathsString.includes("dependabot.yml") &&
    !allPathsString.includes("dependabot.yaml")
  ) {
    addIssue(
      issues,
      "Recommendation: There is no dependabot configuration file. It is recommended to add one ([example dependabot file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/.github/dependabot.yaml))."
    );
  }

  if (allPathsString.includes("eslintrc")) {
    addIssue(issues, "Recommendation: Replace eslintrc by new flat config.");
  } else if (!allPathsString.includes("eslint.config")) {
    addIssue(
      issues,
      "Recommendation: No ESLint configuration was found. ESLint is very helpful, it is worth using it even for small projects ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/eslint.md))."
    );
  } else {
    const packageJsonPath = path.join(moduleDir, "package.json");
    if (await pathExists(packageJsonPath)) {
      try {
        const packageContent = await readFile(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageContent);
        if (
          !packageJson.dependencies?.eslint &&
          !packageJson.devDependencies?.eslint
        ) {
          addIssue(
            issues,
            "Recommendation: ESLint is not in the dependencies or devDependencies. It is recommended to add it to one of them."
          );
        }
        const scripts = packageJson.scripts ?? {};
        if (!scripts.lint) {
          addIssue(
            issues,
            "Recommendation: No lint script found in package.json. It is recommended to add one."
          );
        } else if (!scripts.lint.includes("eslint")) {
          addIssue(
            issues,
            "Recommendation: The lint script in package.json does not contain `eslint`. It is recommended to add it."
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to parse package.json for ${module.name}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    let eslintConfigPath = path.join(moduleDir, "eslint.config.js");
    if (!(await pathExists(eslintConfigPath))) {
      eslintConfigPath = path.join(moduleDir, "eslint.config.mjs");
    }

    if (await pathExists(eslintConfigPath)) {
      const configContent = await readTextSafely(eslintConfigPath);
      if (configContent && !configContent.includes("defineConfig")) {
        addIssue(
          issues,
          `Recommendation: The ESLint configuration file \`${path.basename(eslintConfigPath)}\` does not contain \`defineConfig\`. It is recommended to use it.`
        );
      }
    }
  }

  const branchListing = await getBranchListing(moduleDir);
  if (!branchListing.includes("master")) {
    module.defaultSortWeight -= 1;
  }

  await applyDependencyHelpers({ moduleDir, issues });
}

function applySortAdjustments(module, issuesCount) {
  module.defaultSortWeight += issuesCount;

  const stars = typeof module.stars === "number" ? module.stars : 0;
  module.defaultSortWeight -= Math.floor(stars / 20);

  if (stars < 3) {
    module.defaultSortWeight = Math.max(module.defaultSortWeight, 1);
  }

  if (
    module.maintainer === "KristjanESPERANTO" &&
    module.name !== "MMM-EasyPix" &&
    module.name !== "MMM-Forum"
  ) {
    module.defaultSortWeight = Math.max(module.defaultSortWeight, 1);
  }
}

function buildMarkdown(stats, summaries) {
  const lines = [];
  lines.push("# Result of the module analysis", "");
  lines.push(`Last update: ${stats.lastUpdate}`, "");
  lines.push("## General notes", "");
  lines.push(
    "* This is an automated analysis of the modules. It is not perfect and can contain errors. If you have any questions or suggestions, please open an issue on GitHub."
  );
  lines.push(
    "* Some issues are opinionated recommendations. Please feel free to ignore them.",
    ""
  );
  lines.push("## Statistics", "");
  lines.push("|                      | number   |");
  lines.push("|:---------------------|:--------:|");
  lines.push(
    `| modules analyzed     | ${String(stats.moduleCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| maintainers          | ${String(Object.keys(stats.maintainer).length).padStart(6, " ")}   |`
  );
  lines.push(
    `| modules with issues  | ${String(stats.modulesWithIssuesCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| issues               | ${String(stats.issueCounter).padStart(6, " ")}   |`
  );

  for (const [hoster, count] of Object.entries(stats.repositoryHoster)) {
    lines.push(
      `| modules at ${hoster.padEnd(9, " ")} | ${String(count).padStart(6, " ")}   |`
    );
  }

  lines.push("", "## Modules with issues");

  for (const summary of summaries) {
    lines.push(
      "",
      `### [${summary.name} by ${summary.maintainer}](${summary.url})`,
      ""
    );
    summary.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

async function writeOutputs({ data, stats, summaries }) {
  await ensureDirectory(DATA_DIR);
  await ensureDirectory(path.dirname(RESULT_PATH));

  const markdown = buildMarkdown(stats, summaries);
  await writeFile(RESULT_PATH, markdown, "utf8");

  await writeJson(MODULES_JSON_PATH, data, { pretty: 2 });
  await writeJson(MODULES_MIN_PATH, data, { pretty: 0 });
  await writeJson(STATS_PATH, stats, { pretty: 2 });

  await validateStageData("modules.final", data);
  await validateStageData("modules.min", data);
  await validateStageData("stats", stats);
}

async function main() {
  const stageData = await validateStageFile("modules.stage.5", STAGE5_PATH);
  const modules = Array.isArray(stageData.modules) ? stageData.modules : [];
  const totalModules = modules.length;

  logger.info(`Starting analysis for ${totalModules} modules...`);

  const stats = {
    moduleCounter: 0,
    modulesWithImageCounter: 0,
    modulesWithIssuesCounter: 0,
    issueCounter: 0,
    lastUpdate: formatLocalIsoTimestamp(),
    repositoryHoster: {},
    maintainer: {}
  };

  const issueSummaries = [];

  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    stats.moduleCounter += 1;

    if (module.image) {
      stats.modulesWithImageCounter += 1;
    }

    module.defaultSortWeight = 0;

    const moduleDir = path.join(
      MODULES_DIR,
      `${module.name}-----${module.maintainer}`
    );
    await getLastCommitDate(module, moduleDir);
    if (!module.lastCommit) {
      module.lastCommit = stats.lastUpdate;
    }

    let moduleIssues = normalizeIssuesInput(module.issues);
    module.issues = moduleIssues;

    const repoExists = await pathExists(moduleDir);
    let handledOutdated = false;

    if (!repoExists) {
      moduleIssues = [
        "Error: It appears that the repository could not be cloned. Check the URL."
      ];
      module.issues = moduleIssues;
    } else if (module.outdated) {
      module.defaultSortWeight += 900;
      stats.modulesWithIssuesCounter += 1;
      stats.issueCounter += 1;
      module.issues = false;
      handledOutdated = true;
    } else {
      if (module.isArchived) {
        module.defaultSortWeight += 800;
        addIssue(
          moduleIssues,
          "Module is archived, but not marked as outdated in the official module list."
        );
      } else if (!module.name.startsWith("MMM-") && module.name !== "mmpm") {
        addIssue(
          moduleIssues,
          "Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module."
        );
      }

      await analyzeModule({ module, moduleDir, issues: moduleIssues });
    }

    if (!handledOutdated) {
      const issueCount = moduleIssues.length;
      if (issueCount > 0) {
        stats.modulesWithIssuesCounter += 1;
        stats.issueCounter += issueCount;
        issueSummaries.push({
          name: module.name,
          maintainer: module.maintainer,
          url: module.url,
          issues: moduleIssues.slice()
        });
      }

      module.issues = issueCount > 0;
      applySortAdjustments(module, issueCount);
    }

    const hoster = getRepositoryHost(module.url);
    stats.repositoryHoster[hoster] = (stats.repositoryHoster[hoster] ?? 0) + 1;
    stats.maintainer[module.maintainer] =
      (stats.maintainer[module.maintainer] ?? 0) + 1;

    const processed = index + 1;
    if (processed === totalModules || processed % 25 === 0) {
      logger.info(`Progress: ${processed}/${totalModules} modules processed`);
    }
  }

  stats.maintainer = Object.fromEntries(
    Object.entries(stats.maintainer).sort(([, a], [, b]) => b - a)
  );

  logger.info(
    `${stats.moduleCounter} modules analyzed. For results see file result.md.`
  );

  await writeOutputs({ data: stageData, stats, summaries: issueSummaries });
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
