/**
 * Module analyzer with comprehensive text rules, README validation, and package.json checks.
 * Performs text, package, dependency, and README checks for a module.
 */

import { readFile } from "node:fs/promises";
import {
  PACKAGE_JSON_RULES,
  PACKAGE_LOCK_RULES,
  TEXT_RULES
} from "./rule-registry.ts";

interface AnalysisResult {
  issues: string[];
  recommendations: string[];
}

interface ModuleCheckExceptions {
  skipCodeOfConductCheck?: boolean;
  skipDependabotCheck?: boolean;
  skipEslintChecks?: boolean;
  skipReadmeChecks?: boolean;
}

const MODULE_CHECK_EXCEPTIONS: Record<string, ModuleCheckExceptions> = {
  // mmpm is a standalone management tool, not a classic MM module runtime package.
  // Some mirror-module README/community checks are not meaningful for it.
  "Bee-Mar/mmpm": {
    skipReadmeChecks: true,
    skipDependabotCheck: true,
    skipEslintChecks: true
  }
};

function getRepositoryId(moduleUrl: string): string | null {
  try {
    const url = new URL(moduleUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/u, "");
    if (!owner || !repo) {
      return null;
    }

    return `${owner}/${repo}`;
  }
  catch {
    return null;
  }
}

const MOMENT_USAGE_REGEX = /\bmoment\s*\(|\bmoment\.[A-Za-z_$][\w$]*\s*\(/;
const MOMENT_IMPORT_REQUIRE_REGEX = /require\(["']moment(?:-timezone)?["']\)|from\s+["']moment(?:-timezone)?["']|import\(["']moment(?:-timezone)?["']\)/;
const MOMENT_CORE_INDICATOR_REGEX = /["']moment\.js["']|["']moment-timezone\.js["']/;

function isExcludedForMomentScan(modulePath: string, filePath: string): boolean {
  const relativePath = filePath.startsWith(modulePath)
    ? filePath.slice(modulePath.length).replace(/^\/+/, "")
    : filePath;
  const segments = relativePath.toLowerCase().split("/");

  return segments.includes("test")
    || segments.includes("tests")
    || segments.includes("__tests__")
    || segments.includes("spec")
    || segments.includes("node_modules")
    || segments.includes("dist")
    || segments.includes("build")
    || segments.includes("coverage");
}

function findReadmeConfigObjects(content: string): Array<{ hasTrailingComma: boolean }> {
  const lines = content.split(/\r?\n/u);
  const objects: Array<{ hasTrailingComma: boolean }> = [];
  const headingRegex = /^(#{2,6})\s+(.+?)\s*$/u;
  const fenceOpenRegex = /^```([A-Za-z0-9_-]+)?\s*$/u;
  const fenceCloseRegex = /^```\s*$/u;

  let inConfigSection = false;
  let configSectionLevel = 0;
  let inFence = false;
  let fenceLanguage = "";
  let fenceLines: string[] = [];
  let fenceWasInConfigSection = false;

  for (const line of lines) {
    if (!inFence) {
      const headingMatch = line.match(headingRegex);
      if (headingMatch) {
        const headingLevel = headingMatch[1].length;
        const headingText = headingMatch[2].trim().toLowerCase();

        if (headingText === "config" || headingText === "configuration") {
          inConfigSection = true;
          configSectionLevel = headingLevel;
        }
        else if (inConfigSection && headingLevel <= configSectionLevel) {
          inConfigSection = false;
        }
      }

      const fenceOpenMatch = line.match(fenceOpenRegex);
      if (fenceOpenMatch) {
        inFence = true;
        fenceLanguage = (fenceOpenMatch[1] ?? "").toLowerCase();
        fenceLines = [];
        fenceWasInConfigSection = inConfigSection;
      }

      continue;
    }

    if (fenceCloseRegex.test(line)) {
      const isJavaScriptFence = fenceLanguage === "" || fenceLanguage === "js" || fenceLanguage === "javascript";
      if (fenceWasInConfigSection && isJavaScriptFence) {
        const blockText = fenceLines.join("\n");
        const hasModuleKey = /\bmodule\s*:/u.test(blockText);
        const hasConfigKey = /\bconfig\s*:/u.test(blockText);

        if (hasModuleKey && hasConfigKey) {
          const lastNonEmptyLine = [...fenceLines].reverse().find((fenceLine) => fenceLine.trim().length > 0) ?? "";
          objects.push({
            hasTrailingComma: /^\s*\},\s*(?:\/\/.*)?$/u.test(lastNonEmptyLine)
          });
        }
      }

      inFence = false;
      fenceLanguage = "";
      fenceLines = [];
      fenceWasInConfigSection = false;
      continue;
    }

    fenceLines.push(line);
  }

  return objects;
}

/**
 * Analyze a module for issues and recommendations.
 * This is the core analysis function for the parallel-processing stage.
 */
export async function analyzeModule(
  modulePath: string,
  moduleName: string,
  moduleUrl: string,
  files: string[]
): Promise<AnalysisResult> {
  const issues: string[] = [];
  const moduleRepoId = getRepositoryId(moduleUrl);
  const moduleExceptions = moduleRepoId ? MODULE_CHECK_EXCEPTIONS[moduleRepoId] ?? {} : {};
  let hasMomentUsage = false;
  let hasMomentImportOrRequire = false;
  let hasOwnMomentDependency = false;
  const momentUsageFiles = new Set<string>();

  // Filter out files in node_modules and .git directories.
  // Use path segments instead of substring matching so ".github" files are not excluded.
  const relevantFiles = files.filter(
    (f) => {
      const segments = f.split("/");
      return !segments.includes("node_modules") && !segments.includes(".git");
    }
  );

  // Check for each file
  for (const filePath of relevantFiles) {
    const content = await readFile(filePath, "utf-8").catch(() => "");
    const filename = filePath.split("/").pop() ?? "";
    const filenameLower = filename.toLowerCase();
    const isChangelogFile = filenameLower === "changelog" || filenameLower.startsWith("changelog.");
    const isPackageLockFile = filenameLower === "package-lock.json";
    const relativePath = filePath.startsWith(modulePath)
      ? filePath.slice(modulePath.length).replace(/^\/+/, "")
      : filePath;

    if (!isExcludedForMomentScan(modulePath, filePath) && !filenameLower.endsWith(".min.js")) {
      if (MOMENT_USAGE_REGEX.test(content) || MOMENT_CORE_INDICATOR_REGEX.test(content)) {
        hasMomentUsage = true;
        momentUsageFiles.add(relativePath || filename);
      }

      if (MOMENT_IMPORT_REQUIRE_REGEX.test(content)) {
        hasMomentImportOrRequire = true;
        hasMomentUsage = true;
      }
    }

    // Check TEXT_RULES
    for (const rule of TEXT_RULES) {
      // CHANGELOG entries are historical context and produce low-quality findings.
      if (isChangelogFile) {
        continue;
      }

      // lockfiles should only be checked via lockfile-specific rules.
      if (isPackageLockFile) {
        continue;
      }

      for (const pattern of rule.patterns) {
        if (content.includes(pattern)) {
          issues.push(
            `${rule.category}: Found \`${pattern}\` in file \`${filePath.split("/").pop()}\`: ${rule.description}`
          );
        }
      }
    }

    if (filePath.toLowerCase().includes("stylelint") && content.includes("prettier/prettier")) {
      issues.push(
        `Recommendation: Found \`prettier/prettier\` in file \`${filePath.split("/").pop()}\`: Config would be cleaner using 'stylelint-prettier/recommended'. [See here](https://github.com/prettier/stylelint-prettier).`
      );
    }

    // Package.json specific rules
    if (filePath.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(content);
        if (pkg?.dependencies?.moment || pkg?.dependencies?.["moment-timezone"]
          || pkg?.devDependencies?.moment || pkg?.devDependencies?.["moment-timezone"]
          || pkg?.peerDependencies?.moment || pkg?.peerDependencies?.["moment-timezone"]
          || pkg?.optionalDependencies?.moment || pkg?.optionalDependencies?.["moment-timezone"]) {
          hasOwnMomentDependency = true;
          hasMomentUsage = true;
        }
      }
      catch {
        // Silently ignore JSON parse errors
      }

      for (const rule of PACKAGE_JSON_RULES) {
        for (const pattern of rule.patterns) {
          if (content.includes(pattern)) {
            issues.push(
              `${rule.category}: Found \`${pattern}\` in file \`package.json\`: ${rule.description}`
            );
          }
        }
      }
    }

    // Package-lock.json rules
    if (isPackageLockFile) {
      for (const rule of PACKAGE_LOCK_RULES) {
        for (const pattern of rule.patterns) {
          if (content.includes(pattern)) {
            issues.push(
              `${rule.category}: Found \`${pattern}\` in file \`package-lock.json\`: ${rule.description}`
            );
          }
        }
      }
    }

    // README.md validations (only top-level module README)
    if (relativePath === "README.md" && !moduleExceptions.skipReadmeChecks) {
      // Check for update section
      if (!content.includes("## Updat")) {
        issues.push(
          "Recommendation: The README seems not to have an update section (like `## Update`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Update-Instructions))."
        );
      }

      // Check for install section
      if (!content.includes("## Install")) {
        issues.push(
          "Recommendation: The README seems not to have an install section (like `## Installation`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Installation-Instructions))."
        );
      }

      // Check for modules array
      const falsePositivesModulesArray = ["MMM-pages", "MMM-WebSpeechTTS"];
      if (content.includes("modules: [") && !falsePositivesModulesArray.includes(moduleName)) {
        issues.push(
          "Recommendation: The README seems to have a modules array (Found `modules: [`). This is usually not necessary. Please remove it if it is not needed ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
        );
      }

      // Check for config example
      const configObjects = findReadmeConfigObjects(content);
      const hasConfigExample = configObjects.length > 0;

      if (!hasConfigExample) {
        const falsePositivesConfig = ["MMM-CalendarExt2"];
        if (!content.includes("modules: [") && !falsePositivesConfig.includes(moduleName)) {
          issues.push(
            "Recommendation: The README seems not to have a config example. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
          );
        }
      } else {
        // Check for trailing comma
        const hasTrailingComma = configObjects.some((object) => object.hasTrailingComma);
        const falsePositivesTrailing = ["MMM-MealieMenu", "MMM-Remote-Control"];
        if (!hasTrailingComma && !falsePositivesTrailing.includes(moduleName)) {
          issues.push(
            "Recommendation: The README seems to have a config example without a trailing comma. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
          );
        }
      }

      // Check clone instructions
      if (!content.includes("git clone")) {
        issues.push("Recommendation: The README seems not to have clone instructions.");
      } else {
        if (!content.includes(`git clone ${moduleUrl}`)) {
          issues.push("Recommendation: The README seems to have incorrect clone instructions. Please check the URL.");
        }
      }
    }
  }

  // File existence checks
  const filenames = new Set(relevantFiles.map((f) => f.split("/").pop()?.toUpperCase() ?? ""));

  if (!filenames.has("LICENSE") && !filenames.has("LICENSE.MD")) {
    issues.push(
      "Warning: No LICENSE file ([example LICENSE file](https://github.com/KristjanESPERANTO/MMM-WebSpeechTTS/blob/main/LICENSE.md))."
    );
  }

  if (!filenames.has("CHANGELOG") && !filenames.has("CHANGELOG.MD")) {
    issues.push(
      "Recommendation: There is no CHANGELOG file. It is recommended to add one ([example CHANGELOG file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CHANGELOG.md))."
    );
  }

  if (!moduleExceptions.skipCodeOfConductCheck && !filenames.has("CODE_OF_CONDUCT") && !filenames.has("CODE_OF_CONDUCT.MD")) {
    issues.push(
      "Recommendation: There is no CODE_OF_CONDUCT file. It is recommended to add one ([example CODE_OF_CONDUCT file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CODE_OF_CONDUCT.md))."
    );
  }

  if (!moduleExceptions.skipDependabotCheck && !filenames.has("DEPENDABOT.YAML") && !filenames.has("DEPENDABOT.YML")) {
    issues.push(
      "Recommendation: There is no dependabot configuration file. It is recommended to add one ([example dependabot file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/.github/dependabot.yaml))."
    );
  }

  // Linting setup checks (ESLint or Biome)
  if (!moduleExceptions.skipEslintChecks) {
    const hasOldEslintrc = filenames.has("ESLINTRC") || filenames.has("ESLINTRC.JSON") || filenames.has("ESLINTRC.JS") || filenames.has("ESLINTRC.YML") || filenames.has("ESLINTRC.YAML");
    const hasNewEslint = filenames.has("ESLINT.CONFIG.JS") || filenames.has("ESLINT.CONFIG.MJS");
    const hasBiome = filenames.has("BIOME.JSON") || filenames.has("BIOME.JSONC");

    if (hasOldEslintrc) {
      issues.push("Recommendation: Replace eslintrc by new flat config.");
    } else if (!hasNewEslint && !hasBiome) {
      issues.push(
        "Recommendation: No linter configuration was found. A linter is very helpful, it is worth using one even for small projects. You can use ESLint or Biome ([ESLint guide](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/eslint.md), [Biome guide](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/biome.md))."
      );
    } else if (hasNewEslint) {
      // Check if ESLint is in package.json dependencies
      const packageJsonFiles = relevantFiles.filter((f) => f.endsWith("package.json"));
      for (const pkgFile of packageJsonFiles) {
        const pkgContent = await readFile(pkgFile, "utf-8").catch(() => "{}");
        try {
          const pkg = JSON.parse(pkgContent);
          if (
            !pkg.dependencies?.eslint &&
            !pkg.devDependencies?.eslint
          ) {
            issues.push(
              "Recommendation: ESLint is not in the dependencies or devDependencies. It is recommended to add it to one of them."
            );
          }

          // Check lint script
          if (pkg.scripts) {
            if (!pkg.scripts.lint) {
              issues.push("Recommendation: No lint script found in package.json. It is recommended to add one.");
            } else if (!pkg.scripts.lint.includes("eslint")) {
              issues.push(
                "Recommendation: The lint script in package.json does not contain `eslint`. It is recommended to add it."
              );
            }
          }
        } catch {
          // Silently ignore JSON parse errors
        }
      }

      // Check for defineConfig in eslint.config.js
      const eslintConfigFiles = relevantFiles.filter(
        (f) => f.endsWith("eslint.config.js") || f.endsWith("eslint.config.mjs")
      );
      for (const configFile of eslintConfigFiles) {
        const configContent = await readFile(configFile, "utf-8").catch(() => "");
        if (!configContent.includes("defineConfig")) {
          issues.push(
            `Recommendation: The ESLint configuration file \`${configFile.split("/").pop()}\` does not contain \`defineConfig\`. It is recommended to use it.`
          );
        }
      }
    }
  }

  // Check for node_modules in directory list (not files)
  if (relevantFiles.some((f) => f.endsWith("/node_modules"))) {
    issues.push(
      "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`."
    );
  }

  if (hasMomentUsage && !hasMomentImportOrRequire && !hasOwnMomentDependency) {
    const usageLocations = Array.from(momentUsageFiles).slice(0, 3);
    const usageLocationsText = usageLocations.length > 0
      ? ` Detected in: ${usageLocations.map(location => `\`${location}\``).join(", ")}.`
      : "";

    issues.push(
      `Recommendation: Moment usage was detected, but no module-owned \`moment\`/\`moment-timezone\` dependency or import was found. This likely relies on core-provided Moment.${usageLocationsText} Please declare and import your own dependency.`
    );
  }

  return {
    issues,
    recommendations: [], // Recommendations are mixed into issues for compatibility
  };
}
