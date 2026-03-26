import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";

export interface CheckGroupToggles {
  deep: boolean;
  fast: boolean;
}

export interface CheckIntegrationToggles {
  eslint: boolean;
  npmCheckUpdates: boolean;
  npmDeprecatedCheck: boolean;
}

export interface CheckGroupConfig {
  groups: CheckGroupToggles;
  integrations: CheckIntegrationToggles;
}

interface PartialCheckGroupConfig {
  groups: Partial<CheckGroupToggles>;
  integrations: Partial<CheckIntegrationToggles>;
}

interface PartialGroupsShape {
  deep?: unknown;
  fast?: unknown;
}

interface PartialIntegrationsShape {
  eslint?: unknown;
  npmCheckUpdates?: unknown;
  npmDeprecatedCheck?: unknown;
}

interface ConfigSourceRecord {
  applied?: boolean;
  kind: "default" | "local";
  missing?: boolean;
  path: string;
}

interface ConfigErrorRecord extends ConfigSourceRecord {
  error: Error;
}

export interface LoadedCheckGroupConfig {
  config: Readonly<CheckGroupConfig>;
  errors: ConfigErrorRecord[];
  sources: ConfigSourceRecord[];
}

export const DEFAULT_CHECK_GROUP_CONFIG = Object.freeze({
  groups: Object.freeze({
    fast: true,
    deep: true
  }),
  integrations: Object.freeze({
    npmCheckUpdates: true,
    npmDeprecatedCheck: true,
    eslint: true
  })
});

function createMutableConfig(): CheckGroupConfig {
  return {
    groups: {
      fast: DEFAULT_CHECK_GROUP_CONFIG.groups.fast,
      deep: DEFAULT_CHECK_GROUP_CONFIG.groups.deep
    },
    integrations: {
      npmCheckUpdates: DEFAULT_CHECK_GROUP_CONFIG.integrations.npmCheckUpdates,
      npmDeprecatedCheck: DEFAULT_CHECK_GROUP_CONFIG.integrations.npmDeprecatedCheck,
      eslint: DEFAULT_CHECK_GROUP_CONFIG.integrations.eslint
    }
  };
}

function normalizePartial(input: unknown): PartialCheckGroupConfig {
  const normalized: PartialCheckGroupConfig = {
    groups: {},
    integrations: {}
  };

  if (!input || typeof input !== "object") {
    return normalized;
  }

  const rawGroups = (input as { groups?: unknown }).groups;
  if (rawGroups && typeof rawGroups === "object") {
    const groups = rawGroups as PartialGroupsShape;
    if (typeof groups.fast === "boolean") {
      normalized.groups.fast = groups.fast;
    }
    if (typeof groups.deep === "boolean") {
      normalized.groups.deep = groups.deep;
    }
  }

  const rawIntegrations = (input as { integrations?: unknown }).integrations;
  if (rawIntegrations && typeof rawIntegrations === "object") {
    const integrations = rawIntegrations as PartialIntegrationsShape;
    if (typeof integrations.npmCheckUpdates === "boolean") {
      normalized.integrations.npmCheckUpdates
        = integrations.npmCheckUpdates;
    }
    if (typeof integrations.npmDeprecatedCheck === "boolean") {
      normalized.integrations.npmDeprecatedCheck
        = integrations.npmDeprecatedCheck;
    }
    if (typeof integrations.eslint === "boolean") {
      normalized.integrations.eslint = integrations.eslint;
    }
  }

  return normalized;
}

function applyPartialConfig(target: CheckGroupConfig, partial: PartialCheckGroupConfig): CheckGroupConfig {
  if (partial.groups.fast !== undefined) {
    target.groups.fast = partial.groups.fast;
  }
  if (partial.groups.deep !== undefined) {
    target.groups.deep = partial.groups.deep;
  }

  if (partial.integrations.npmCheckUpdates !== undefined) {
    target.integrations.npmCheckUpdates = partial.integrations.npmCheckUpdates;
  }
  if (partial.integrations.npmDeprecatedCheck !== undefined) {
    target.integrations.npmDeprecatedCheck
      = partial.integrations.npmDeprecatedCheck;
  }
  if (partial.integrations.eslint !== undefined) {
    target.integrations.eslint = partial.integrations.eslint;
  }

  return target;
}

function freezeConfig(config: CheckGroupConfig): Readonly<CheckGroupConfig> {
  return Object.freeze({
    groups: Object.freeze({
      fast: config.groups.fast,
      deep: config.groups.deep
    }),
    integrations: Object.freeze({
      npmCheckUpdates: config.integrations.npmCheckUpdates,
      npmDeprecatedCheck: config.integrations.npmDeprecatedCheck,
      eslint: config.integrations.eslint
    })
  });
}

export async function loadCheckGroupConfig({ projectRoot }: { projectRoot?: string } = {}): Promise<LoadedCheckGroupConfig> {
  const overrideRoot = process.env.CHECK_MODULES_CONFIG_ROOT;
  let root;
  if (overrideRoot) {
    root = path.resolve(overrideRoot);
  }
  else if (projectRoot) {
    root = path.resolve(projectRoot);
  }
  else {
    root = process.cwd();
  }
  const configDir = path.join(root, "scripts", "check-modules");
  const basePath = path.join(configDir, "check-groups.config.json");
  const localPath = path.join(configDir, "check-groups.config.local.json");

  const mutableConfig = createMutableConfig();
  const sources: ConfigSourceRecord[] = [];
  const errors: ConfigErrorRecord[] = [];

  const candidates: ConfigSourceRecord[] = [
    { path: basePath, kind: "default" },
    { path: localPath, kind: "local" }
  ];

  for (const candidate of candidates) {
    try {
      const contents = await readFile(candidate.path, "utf8");
      const parsed = JSON.parse(contents);
      const partial = normalizePartial(parsed);
      applyPartialConfig(mutableConfig, partial);
      sources.push({ ...candidate, applied: true });
    }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        sources.push({ ...candidate, applied: false, missing: true });
      }
      else {
        const normalizedError
          = error instanceof Error ? error : new Error(String(error));
        errors.push({ ...candidate, error: normalizedError });
      }
    }
  }

  return {
    config: freezeConfig(mutableConfig),
    sources,
    errors
  };
}
