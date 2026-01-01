import {ensureDirectory, fileExists, readJson, writeJson} from "./fs-utils.js";
import path from "node:path";

const DEFAULT_VERSION = 1;

function normalizeKey (key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("Persistent cache keys must be non-empty strings");
  }
  return key;
}

function cloneCacheEntry (entry) {
  const cloned = {
    value: structuredClone(entry.value),
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt,
    ttlMs: entry.ttlMs
  };
  if (entry.metadata) {
    cloned.metadata = structuredClone(entry.metadata);
  }
  return cloned;
}

function buildStoredEntry ({value, metadata, expiresAt, timestamp, ttlMs}) {
  const stored = {
    value: structuredClone(value),
    updatedAt: timestamp,
    expiresAt,
    ttlMs: ttlMs ?? null
  };
  if (metadata) {
    stored.metadata = structuredClone(metadata);
  }
  return stored;
}

function toIsoString (timestamp) {
  return new Date(timestamp).toISOString();
}

function isExpired ({expiresAt}, now) {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= now;
}

function createEmptyState ({version}) {
  return {
    version,
    generatedAt: toIsoString(Date.now()),
    entries: {}
  };
}

export function createPersistentCache ({filePath, version = DEFAULT_VERSION, defaultTtlMs = 0, now = () => Date.now()} = {}) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("createPersistentCache requires a non-empty filePath");
  }

  const resolvedPath = path.resolve(filePath);
  const state = createEmptyState({version});
  let loaded = false;
  let dirty = false;

  async function load () {
    if (loaded) {
      return;
    }

    if (await fileExists(resolvedPath)) {
      try {
        const stored = await readJson(resolvedPath);
        if (stored && typeof stored === "object" && stored.entries) {
          state.version = stored.version ?? version;
          state.generatedAt = stored.generatedAt ?? toIsoString(now());
          state.entries = stored.entries ?? {};
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load persistent cache at ${resolvedPath}: ${message}`, {cause: error});
      }
    }

    loaded = true;
    await pruneExpired();
  }

  function snapshot () {
    return {
      version: state.version,
      generatedAt: state.generatedAt,
      entries: state.entries
    };
  }

  function pruneExpired () {
    const current = now();
    let removed = false;

    for (const [key, entry] of Object.entries(state.entries)) {
      if (isExpired(entry, current)) {
        delete state.entries[key];
        removed = true;
      }
    }

    if (removed) {
      dirty = true;
    }
  }

  function get (key) {
    const normalizedKey = normalizeKey(key);
    const entry = state.entries[normalizedKey];

    if (!entry) {
      return null;
    }

    if (isExpired(entry, now())) {
      delete state.entries[normalizedKey];
      dirty = true;
      return null;
    }

    return cloneCacheEntry(entry);
  }

  function set (key, value, {ttlMs = defaultTtlMs, metadata} = {}) {
    const normalizedKey = normalizeKey(key);
    const current = now();
    const expiresAt = ttlMs && ttlMs > 0 ? toIsoString(current + ttlMs) : null;

    state.entries[normalizedKey] = buildStoredEntry({
      value,
      metadata,
      expiresAt,
      timestamp: toIsoString(current),
      ttlMs
    });
    dirty = true;
    return cloneCacheEntry(state.entries[normalizedKey]);
  }

  function deleteKey (key) {
    const normalizedKey = normalizeKey(key);
    if (Object.hasOwn(state.entries, normalizedKey)) {
      delete state.entries[normalizedKey];
      dirty = true;
    }
  }

  function entries () {
    return Object.entries(state.entries).map(([key, entry]) => ({key, entry: cloneCacheEntry(entry)}));
  }

  function getAllKeys () {
    return Object.keys(state.entries);
  }

  async function flush () {
    if (!loaded || !dirty) {
      return;
    }

    const dirPath = path.dirname(resolvedPath);
    await ensureDirectory(dirPath);

    const snapshotData = snapshot();
    snapshotData.generatedAt = toIsoString(now());
    await writeJson(resolvedPath, snapshotData, {pretty: 2, ensureDir: true});
    dirty = false;
  }

  return {
    load,
    flush,
    get,
    set,
    delete: deleteKey,
    entries,
    getAllKeys,
    pruneExpired,
    snapshot
  };
}
