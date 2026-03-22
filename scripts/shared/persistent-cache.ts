import { ensureDirectory, fileExists, readJson, writeJson } from "./fs-utils.ts";
import path from "node:path";

const DEFAULT_VERSION = 1;

type CacheVersion = number | string;

interface StoredCacheEntry {
  expiresAt: string | null;
  metadata?: unknown;
  ttlMs: number | null;
  updatedAt: string;
  value: unknown;
}

interface CacheState {
  entries: Record<string, StoredCacheEntry>;
  generatedAt: string;
  version: CacheVersion;
}

interface CacheSnapshot {
  entries: Record<string, StoredCacheEntry>;
  generatedAt: string;
  version: CacheVersion;
}

interface CacheEntryView extends StoredCacheEntry {}

interface SetOptions {
  metadata?: unknown;
  ttlMs?: number;
}

type SetOptionsInput = SetOptions | number;

interface CreatePersistentCacheOptions {
  defaultTtlMs?: number;
  filePath?: string;
  now?: () => number;
  version?: CacheVersion;
}

interface PersistentCacheApi {
  delete: (key: string) => void;
  entries: () => Array<{ entry: CacheEntryView; key: string }>;
  flush: () => Promise<void>;
  get: (key: string) => CacheEntryView | null;
  getAllKeys: () => string[];
  load: () => Promise<void>;
  pruneExpired: () => void;
  set: (key: string, value: unknown, options?: SetOptionsInput) => CacheEntryView;
  snapshot: () => CacheSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isStoredCacheEntry(value: unknown): value is StoredCacheEntry {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.updatedAt === "string"
    && (typeof value.expiresAt === "string" || value.expiresAt === null)
    && (typeof value.ttlMs === "number" || value.ttlMs === null)
    && Object.hasOwn(value, "value");
}

function normalizeStoredEntries(value: unknown): Record<string, StoredCacheEntry> {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: Record<string, StoredCacheEntry> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isStoredCacheEntry(entry)) {
      normalized[key] = entry;
    }
  }
  return normalized;
}

function normalizeStoredState(stored: unknown, version: CacheVersion, currentTime: number): CacheState {
  if (!isRecord(stored)) {
    return createEmptyState({ version, currentTime });
  }

  const storedVersion = stored.version;
  if (storedVersion !== version) {
    return createEmptyState({ version, currentTime });
  }

  return {
    version,
    generatedAt: typeof stored.generatedAt === "string" ? stored.generatedAt : toIsoString(currentTime),
    entries: normalizeStoredEntries(stored.entries)
  };
}

function normalizeKey(key: string): string {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("Persistent cache keys must be non-empty strings");
  }
  return key;
}

function cloneCacheEntry(entry: StoredCacheEntry): CacheEntryView {
  const cloned: StoredCacheEntry = {
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

function buildStoredEntry({
  value,
  metadata,
  expiresAt,
  timestamp,
  ttlMs
}: {
  expiresAt: string | null;
  metadata?: unknown;
  timestamp: string;
  ttlMs: number;
  value: unknown;
}): StoredCacheEntry {
  const stored: StoredCacheEntry = {
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

function toIsoString(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function isExpired({ expiresAt }: StoredCacheEntry, now: number): boolean {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= now;
}

function createEmptyState({ version, currentTime }: { currentTime: number; version: CacheVersion }): CacheState {
  return {
    version,
    generatedAt: toIsoString(currentTime),
    entries: {}
  };
}

export function createPersistentCache({
  filePath,
  version = DEFAULT_VERSION,
  defaultTtlMs = 0,
  now = () => Date.now()
}: CreatePersistentCacheOptions = {}): PersistentCacheApi {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("createPersistentCache requires a non-empty filePath");
  }

  const resolvedPath = path.resolve(filePath);
  const state = createEmptyState({ version, currentTime: now() });
  let loaded = false;
  let dirty = false;

  async function load(): Promise<void> {
    if (loaded) {
      return;
    }

    if (await fileExists(resolvedPath)) {
      try {
        const stored = await readJson(resolvedPath);
        const normalized = normalizeStoredState(stored, version, now());
        state.version = normalized.version;
        state.generatedAt = normalized.generatedAt;
        state.entries = normalized.entries;
        if (normalized.version !== (isRecord(stored) ? stored.version : undefined)) {
          dirty = true;
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load persistent cache at ${resolvedPath}: ${message}`, { cause: error });
      }
    }

    loaded = true;
    pruneExpired();
  }

  function snapshot(): CacheSnapshot {
    return {
      version: state.version,
      generatedAt: state.generatedAt,
      entries: state.entries
    };
  }

  function pruneExpired(): void {
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

  function get(key: string): CacheEntryView | null {
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

  function set(key: string, value: unknown, options: SetOptionsInput = {}): CacheEntryView {
    const resolvedOptions: SetOptions = typeof options === "number"
      ? { ttlMs: options }
      : options;

    const { ttlMs = defaultTtlMs, metadata } = resolvedOptions;
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

  function deleteKey(key: string): void {
    const normalizedKey = normalizeKey(key);
    if (Object.hasOwn(state.entries, normalizedKey)) {
      delete state.entries[normalizedKey];
      dirty = true;
    }
  }

  function entries(): Array<{ key: string; entry: CacheEntryView }> {
    return Object.entries(state.entries).map(([key, entry]) => ({ key, entry: cloneCacheEntry(entry) }));
  }

  function getAllKeys(): string[] {
    return Object.keys(state.entries);
  }

  async function flush(): Promise<void> {
    if (!loaded || !dirty) {
      return;
    }

    const dirPath = path.dirname(resolvedPath);
    await ensureDirectory(dirPath);

    const snapshotData = snapshot();
    snapshotData.generatedAt = toIsoString(now());
    await writeJson(resolvedPath, snapshotData, { pretty: 2, ensureDir: true });
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
