export const PLACEHOLDER_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function deepSortObject (value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepSortObject(item));
  }

  if (value && typeof value === "object" && value.constructor === Object) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = deepSortObject(value[key]);
    }
    return sorted;
  }

  return value;
}

function compareById (a, b) {
  const idA = (a?.id ?? a?.name ?? "").toString();
  const idB = (b?.id ?? b?.name ?? "").toString();
  return idA.localeCompare(idB, "en", {sensitivity: "base"});
}

export function sanitizeModulesArray (modules = []) {
  return [...modules]
    .map((module) => sanitizeModuleEntry(module))
    .sort(compareById);
}

function sanitizeModuleEntry (module) {
  const sanitized = deepSortObject(module ?? {});

  /* Ignore volatile fields derived from live heuristics to keep the golden snapshots stable. */
  delete sanitized.defaultSortWeight;
  delete sanitized.issues;
  delete sanitized.lastCommit;
  return sanitized;
}

export function sanitizeRepositoryArray (repositories = []) {
  return [...repositories]
    .map((repo) => deepSortObject(repo))
    .sort(compareById);
}

export function sanitizeModulesContainer (data) {
  const sanitized = deepSortObject(data ?? {});
  if (Array.isArray(data?.modules)) {
    sanitized.modules = sanitizeModulesArray(data.modules);
  }
  if (Object.hasOwn(sanitized, "lastUpdate")) {
    sanitized.lastUpdate = PLACEHOLDER_TIMESTAMP;
  }
  return sanitized;
}

export function sanitizeStage1 (data) {
  return {
    lastUpdate: PLACEHOLDER_TIMESTAMP,
    modules: sanitizeModulesArray(data?.modules ?? [])
  };
}

export function sanitizeStage2 (modules) {
  return sanitizeModulesArray(modules);
}

export function sanitizeStage3 (data) {
  return sanitizeModulesContainer(data);
}

export function sanitizeStage4 (data) {
  return sanitizeModulesContainer(data);
}

export function sanitizeStage5 (data) {
  return sanitizeModulesContainer(data);
}

export function sanitizeFinalModules (data) {
  return sanitizeModulesContainer(data);
}

export function sanitizeStats (data) {
  const sanitized = deepSortObject(data ?? {});
  if (Object.hasOwn(sanitized, "lastUpdate")) {
    sanitized.lastUpdate = PLACEHOLDER_TIMESTAMP;
  }
  delete sanitized.issueCounter;
  return sanitized;
}

export function sanitizeGitHubData (data) {
  return {
    lastUpdate: PLACEHOLDER_TIMESTAMP,
    repositories: sanitizeRepositoryArray(data?.repositories ?? [])
  };
}

export function sanitizeSkippedModules (data) {
  return sanitizeModulesArray(data ?? []);
}

export function stableStringify (value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
