export const PLACEHOLDER_TIMESTAMP = "1970-01-01T00:00:00.000Z";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ModuleLike {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

interface ModulesContainer {
  lastUpdate?: string;
  modules?: unknown[];
  [key: string]: unknown;
}

interface RepositoriesContainer {
  lastUpdate?: string;
  repositories?: unknown[];
  [key: string]: unknown;
}

interface StatsLike {
  issueCounter?: unknown;
  lastUpdate?: string;
  [key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && value.constructor === Object;
}

export function deepSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => deepSortObject(item));
  }

  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = deepSortObject(value[key]);
    }
    return sorted;
  }

  return value;
}

function compareById(a: ModuleLike, b: ModuleLike): number {
  const idA = (a?.id ?? a?.name ?? "").toString();
  const idB = (b?.id ?? b?.name ?? "").toString();
  return idA.localeCompare(idB, "en", { sensitivity: "base" });
}

export function sanitizeModulesArray(modules: unknown[] = []): unknown[] {
  return [...modules]
    .map(module => sanitizeModuleEntry(module))
    .sort(compareById);
}

function sanitizeModuleEntry(module: unknown): Record<string, unknown> {
  const sanitized = deepSortObject(module ?? {});
  if (!isPlainObject(sanitized)) {
    return {};
  }

  /* Ignore volatile fields derived from live heuristics to keep the golden snapshots stable. */
  delete sanitized.defaultSortWeight;
  delete sanitized.issues;
  delete sanitized.lastCommit;
  delete sanitized.stars;
  return sanitized;
}

export function sanitizeRepositoryArray(repositories: unknown[] = []): unknown[] {
  return [...repositories]
    .map(repo => deepSortObject(repo) as ModuleLike)
    .sort(compareById);
}

export function sanitizeModulesContainer(data: ModulesContainer | null | undefined): Record<string, unknown> {
  const sanitized = deepSortObject(data ?? {});
  if (!isPlainObject(sanitized)) {
    return {};
  }
  if (Array.isArray(data?.modules)) {
    sanitized.modules = sanitizeModulesArray(data.modules);
  }
  if (Object.hasOwn(sanitized, "lastUpdate")) {
    sanitized.lastUpdate = PLACEHOLDER_TIMESTAMP;
  }
  return sanitized;
}

export function sanitizeStage1(data: ModulesContainer | null | undefined): { lastUpdate: string; modules: unknown[] } {
  return {
    lastUpdate: PLACEHOLDER_TIMESTAMP,
    modules: sanitizeModulesArray(data?.modules ?? [])
  };
}

export function sanitizeStage2(modules: unknown[] | null | undefined): unknown[] {
  return sanitizeModulesArray(modules ?? []);
}

export function sanitizeStage3(data: ModulesContainer | null | undefined): Record<string, unknown> {
  return sanitizeModulesContainer(data);
}

export function sanitizeStage4(data: ModulesContainer | null | undefined): Record<string, unknown> {
  return sanitizeModulesContainer(data);
}

export function sanitizeFinalModules(data: ModulesContainer | null | undefined): Record<string, unknown> {
  return sanitizeModulesContainer(data);
}

export function sanitizeStats(data: StatsLike | null | undefined): Record<string, unknown> {
  const sanitized = deepSortObject(data ?? {});
  if (!isPlainObject(sanitized)) {
    return {};
  }
  if (Object.hasOwn(sanitized, "lastUpdate")) {
    sanitized.lastUpdate = PLACEHOLDER_TIMESTAMP;
  }
  delete sanitized.issueCounter;
  return sanitized;
}

export function sanitizeGitHubData(data: RepositoriesContainer | null | undefined): { lastUpdate: string; repositories: unknown[] } {
  return {
    lastUpdate: PLACEHOLDER_TIMESTAMP,
    repositories: sanitizeRepositoryArray(data?.repositories ?? [])
  };
}

export function sanitizeSkippedModules(data: unknown[] | null | undefined): unknown[] {
  return sanitizeModulesArray(data ?? []);
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
