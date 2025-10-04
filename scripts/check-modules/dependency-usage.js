import {builtinModules} from "node:module";
import path from "node:path";

export {MISSING_DEPENDENCY_RULE_ID} from "./missing-dependency-rule.js";

const SOURCE_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx"
]);

const IGNORED_PATH_SEGMENTS = new Set([
  "build",
  "coverage",
  "dist",
  "docs",
  "documentation",
  "examples",
  "example",
  "fixtures",
  "vendor",
  "vendors"
]);

const BUILTIN_DEPENDENCIES = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
]);

const DEFAULT_IGNORED_DEPENDENCIES = new Set(["express", "node_helper", "logger"]);

const DEPENDENCY_CAPTURE_PATTERNS = Object.freeze([
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  /\bfrom\s+["']([^"']+)["']/gu,
  /\bimport\s+["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu
]);

function isRelativeModule (specifier) {
  if (typeof specifier !== "string") {
    return false;
  }
  const trimmed = specifier.trim();
  return trimmed.startsWith(".") || trimmed.startsWith("/");
}

function isBuiltinModule (specifier) {
  if (typeof specifier !== "string" || specifier.length === 0) {
    return false;
  }

  const trimmed = specifier.trim();
  if (BUILTIN_DEPENDENCIES.has(trimmed)) {
    return true;
  }

  const withoutNodePrefix = trimmed.replace(/^node:/u, "");
  const [firstSegment] = withoutNodePrefix.split("/");
  if (!firstSegment) {
    return false;
  }

  return BUILTIN_DEPENDENCIES.has(firstSegment) || BUILTIN_DEPENDENCIES.has(`node:${firstSegment}`);
}

function toPackageName (specifier) {
  if (typeof specifier !== "string") {
    return null;
  }

  const trimmed = specifier.trim();
  if (trimmed.length === 0 || isRelativeModule(trimmed) || isBuiltinModule(trimmed)) {
    return null;
  }

  const withoutNodePrefix = trimmed.replace(/^node:/u, "");

  if (withoutNodePrefix.startsWith("@")) {
    const segments = withoutNodePrefix.split("/");
    if (segments.length >= 2) {
      return `${segments[0]}/${segments[1]}`;
    }
    return withoutNodePrefix;
  }

  const slashIndex = withoutNodePrefix.indexOf("/");
  if (slashIndex === -1) {
    return withoutNodePrefix;
  }

  return withoutNodePrefix.slice(0, slashIndex);
}

function extractImportedModuleSpecifiers (content) {
  const modules = new Set();
  if (typeof content !== "string" || content.length === 0) {
    return modules;
  }

  for (const pattern of DEPENDENCY_CAPTURE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const [, specifier] = match;
      if (typeof specifier === "string" && specifier.length > 0) {
        modules.add(specifier);
      }
    }
  }

  return modules;
}

function buildIgnoreSet (maybeIgnore) {
  const ignore = new Set(DEFAULT_IGNORED_DEPENDENCIES);
  if (!maybeIgnore) {
    return ignore;
  }

  const values = [];
  if (Array.isArray(maybeIgnore)) {
    values.push(...maybeIgnore);
  } else if (maybeIgnore instanceof Set) {
    values.push(...maybeIgnore);
  } else {
    values.push(maybeIgnore);
  }

  for (const entry of values) {
    if (typeof entry === "string" && entry.length > 0) {
      ignore.add(entry.toLowerCase());
    }
  }

  return ignore;
}

function normalizePathSegments (relativePath) {
  return relativePath
    .split(path.sep)
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);
}

export function shouldAnalyzeFileForDependencyUsage (relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return false;
  }

  const segments = normalizePathSegments(relativePath);
  if (segments.some((segment) => IGNORED_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  const extension = path.extname(relativePath).toLowerCase();
  return SOURCE_FILE_EXTENSIONS.has(extension);
}

export function detectUsedDependencies (content, options = {}) {
  const detected = new Set();
  const ignore = buildIgnoreSet(options.ignore);

  const specifiers = extractImportedModuleSpecifiers(content);
  for (const specifier of specifiers) {
    const packageName = toPackageName(specifier);
    if (packageName) {
      const normalized = packageName.toLowerCase();
      if (!ignore.has(normalized)) {
        detected.add(packageName);
      }
    }
  }

  return detected;
}

export function extractDeclaredDependencyNames (packageSummary) {
  const declared = new Set();
  if (!packageSummary || typeof packageSummary !== "object") {
    return declared;
  }

  const sections = [
    packageSummary.dependencies,
    packageSummary.devDependencies,
    packageSummary.peerDependencies,
    packageSummary.optionalDependencies
  ];

  for (const section of sections) {
    if (section && typeof section === "object") {
      for (const name of Object.keys(section)) {
        if (typeof name === "string" && name.length > 0) {
          declared.add(name.toLowerCase());
        }
      }
    }
  }

  return declared;
}

export function findMissingDependencies ({usedDependencies, declaredDependencies}) {
  const declared = declaredDependencies ?? new Set();
  const used = usedDependencies ?? new Set();
  const missing = new Set();

  for (const name of used) {
    const normalized = typeof name === "string" ? name.toLowerCase() : null;
    if (normalized && !declared.has(normalized)) {
      missing.add(name);
    }
  }

  return Array.from(missing).sort((a, b) => a.localeCompare(b));
}
