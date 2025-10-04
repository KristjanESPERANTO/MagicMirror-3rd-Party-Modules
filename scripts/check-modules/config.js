import path from "node:path";
import process from "node:process";
import {readFile} from "node:fs/promises";

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

function createMutableConfig () {
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

function normalizePartial (input) {
  const normalized = {
    groups: {},
    integrations: {}
  };

  if (!input || typeof input !== "object") {
    return normalized;
  }

  const rawGroups = input.groups;
  if (rawGroups && typeof rawGroups === "object") {
    if (typeof rawGroups.fast === "boolean") {
      normalized.groups.fast = rawGroups.fast;
    }
    if (typeof rawGroups.deep === "boolean") {
      normalized.groups.deep = rawGroups.deep;
    }
  }

  const rawIntegrations = input.integrations;
  if (rawIntegrations && typeof rawIntegrations === "object") {
    if (typeof rawIntegrations.npmCheckUpdates === "boolean") {
      normalized.integrations.npmCheckUpdates =
        rawIntegrations.npmCheckUpdates;
    }
    if (typeof rawIntegrations.npmDeprecatedCheck === "boolean") {
      normalized.integrations.npmDeprecatedCheck =
        rawIntegrations.npmDeprecatedCheck;
    }
    if (typeof rawIntegrations.eslint === "boolean") {
      normalized.integrations.eslint = rawIntegrations.eslint;
    }
  }

  return normalized;
}

function applyPartialConfig (target, partial) {
  if (Object.hasOwn(partial.groups, "fast")) {
    target.groups.fast = partial.groups.fast;
  }
  if (Object.hasOwn(partial.groups, "deep")) {
    target.groups.deep = partial.groups.deep;
  }

  if (Object.hasOwn(partial.integrations, "npmCheckUpdates")) {
    target.integrations.npmCheckUpdates = partial.integrations.npmCheckUpdates;
  }
  if (Object.hasOwn(partial.integrations, "npmDeprecatedCheck")) {
    target.integrations.npmDeprecatedCheck =
      partial.integrations.npmDeprecatedCheck;
  }
  if (Object.hasOwn(partial.integrations, "eslint")) {
    target.integrations.eslint = partial.integrations.eslint;
  }

  return target;
}

function freezeConfig (config) {
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

export async function loadCheckGroupConfig ({projectRoot} = {}) {
  const overrideRoot = process.env.CHECK_MODULES_CONFIG_ROOT;
  let root;
  if (overrideRoot) {
    root = path.resolve(overrideRoot);
  } else if (projectRoot) {
    root = path.resolve(projectRoot);
  } else {
    root = process.cwd();
  }
  const configDir = path.join(root, "scripts", "check-modules");
  const basePath = path.join(configDir, "check-groups.config.json");
  const localPath = path.join(configDir, "check-groups.config.local.json");

  const mutableConfig = createMutableConfig();
  const sources = [];
  const errors = [];

  const candidates = [
    {path: basePath, kind: "default"},
    {path: localPath, kind: "local"}
  ];

  for (const candidate of candidates) {
    try {
      const contents = await readFile(candidate.path, "utf8");
      const parsed = JSON.parse(contents);
      const partial = normalizePartial(parsed);
      applyPartialConfig(mutableConfig, partial);
      sources.push({...candidate, applied: true});
    } catch (error) {
      if (error && error.code === "ENOENT") {
        sources.push({...candidate, applied: false, missing: true});
      } else {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        errors.push({...candidate, error: normalizedError});
      }
    }
  }

  return {
    config: freezeConfig(mutableConfig),
    sources,
    errors
  };
}
