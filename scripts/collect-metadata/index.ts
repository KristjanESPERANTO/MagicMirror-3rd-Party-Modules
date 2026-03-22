/* Unified metadata collector for stage 1+2 */

// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { fetchRepositoryData, normalizeRepositoryData } from "../updateRepositoryApiData/api.js";
// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { getRepositoryId, getRepositoryType } from "../updateRepositoryApiData/helpers.js";
// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { createHttpClient } from "../shared/http-client.js";
// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { createLogger } from "../shared/logger.js";
// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { createPersistentCache } from "../shared/persistent-cache.js";
// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { createRateLimiter } from "../shared/rate-limiter.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
// @ts-ignore -- legacy JS helper module, typing deferred to later migration slice
import { loadPreviousModules } from "../shared/module-list.js";
import { parseModuleList } from "./parser.ts";
import type { ParsedModuleEntry } from "./parser.ts";
import path from "node:path";
import process from "node:process";

interface EnrichedModule extends ParsedModuleEntry {
  hasGithubIssues?: boolean | null;
  isArchived?: boolean | null;
  lastCommit?: string | null;
  license?: string | null;
  stars?: number;
  [key: string]: unknown;
}

interface CachedRepositoryValue {
  error?: string;
  isFailed?: boolean;
  [key: string]: unknown;
}

interface CachedRepositoryEntry {
  value: CachedRepositoryValue;
}

interface FetchTextResult {
  data: string;
  ok: boolean;
  status: number;
  statusText?: string;
}

interface FetchJsonResult {
  data: unknown;
  ok: boolean;
  status: number;
}

interface GraphQlRepoData {
  hasIssuesEnabled?: boolean;
  isArchived?: boolean;
  stargazerCount?: number;
  [key: string]: unknown;
}

interface GitHubBatchResult {
  error: string | null;
  failed: boolean;
  results: Record<string, GraphQlRepoData>;
}

interface ModuleStats {
  errors: number;
  fallbacks: number;
  hits: number;
  misses: number;
}

interface CircuitBreaker {
  consecutive403Errors: number;
  stopFetching: boolean;
  recordError: (error: Error) => void;
  recordSuccess: () => void;
}

interface ProcessModuleContext {
  circuitBreaker: CircuitBreaker;
  client: unknown;
  githubModulesToFetch: EnrichedModule[];
  previousModulesMap: Map<string, EnrichedModule>;
  stats: ModuleStats;
}

interface IndividualFetchSuccess {
  data: CachedRepositoryValue;
  success: true;
}

interface IndividualFetchFailure {
  error: Error;
  success: false;
}

type IndividualFetchResult = IndividualFetchSuccess | IndividualFetchFailure;

interface AppendGitHubBatchResultOptions {
  batchFailed: boolean;
  batchResults: Record<string, GraphQlRepoData>;
  enrichedModules: EnrichedModule[];
  module: EnrichedModule;
  previousModulesMap: Map<string, EnrichedModule>;
  stats: ModuleStats;
}

type Stage2OutputWriter = (modules: EnrichedModule[], outputPath: string) => string | Promise<string>;

interface RunCollectMetadataOptions {
  markdown?: string;
  outputPath?: string;
  outputWriter?: Stage2OutputWriter | null;
  previousModulesMap?: Map<string, EnrichedModule>;
}

interface RunCollectMetadataResult {
  modules: EnrichedModule[];
  outputPath: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const logger = createLogger({ name: "collect-metadata" });

const WIKI_URL = "https://raw.githubusercontent.com/wiki/MagicMirrorOrg/MagicMirror/3rd-Party-Modules.md";
const REPOSITORY_CACHE_PATH = path.join("website", "data", "cache", "repository-api-cache.json");
const REPOSITORY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 1 day
const GITHUB_GRAPHQL_BATCH_SIZE = 100;
const FORCE_REFRESH = process.env.FORCE_REFRESH === "true";

const rateLimiter = createRateLimiter({
  tokensPerInterval: 2,
  intervalMs: 1000
});

const httpClient = createHttpClient({ rateLimiter });

const repositoryCache = createPersistentCache({
  filePath: REPOSITORY_CACHE_PATH,
  defaultTtlMs: REPOSITORY_CACHE_TTL_MS,
  version: "repository-api/v1"
});

/**
 * Fetch the raw Markdown content from the Wiki or a local file.
 */
async function fetchMarkdown(): Promise<string> {
  if (process.env.WIKI_FILE) {
    logger.info(`Reading module list from local file: ${process.env.WIKI_FILE}`);
    return fs.readFileSync(process.env.WIKI_FILE, "utf8");
  }

  logger.info(`Fetching module list from Wiki: ${WIKI_URL}`);
  const result = await httpClient.getText(WIKI_URL) as FetchTextResult;
  if (!result.ok) {
    throw new Error(`Failed to fetch Wiki: ${result.status} ${result.statusText}`);
  }
  return result.data;
}

/**
 * Fetch metadata for a batch of GitHub repositories using GraphQL.
 */
async function fetchGitHubBatch(modules: EnrichedModule[]): Promise<GitHubBatchResult> {
  if (modules.length === 0) {
    return { results: {}, failed: false, error: null };
  }

  const repoFragments: string[] = [];
  const aliasMap: Record<string, string> = {};

  for (const [index, module] of modules.entries()) {
    const repoId = getRepositoryId(module.url);
    if (repoId) {
      const [owner, name] = repoId.split("/");
      const alias = `repo${index}`;
      aliasMap[alias] = module.url; // Map alias back to module URL

      repoFragments.push(`
        ${alias}: repository(owner: "${owner}", name: "${name}") {
          openIssues: issues(states: OPEN) { totalCount }
          stargazerCount
          isArchived
          isDisabled
          hasIssuesEnabled
          pushedAt
          licenseInfo { spdxId }
          defaultBranchRef {
            name
            target {
              ... on Commit {
                committedDate
              }
            }
          }
        }
      `);
    }
  }

  const query = `query { ${repoFragments.join("\n")} }`;

  try {
    const response = await httpClient.getJson("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    }) as FetchJsonResult;

    if (!response.ok) {
      logger.error(`GitHub GraphQL batch failed: ${response.status}`);
      return {
        results: {},
        failed: true,
        error: `HTTP ${response.status}`
      };
    }

    const payload = response.data as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> } | null;
    if (!payload || typeof payload !== "object") {
      return {
        results: {},
        failed: true,
        error: "Invalid GraphQL payload"
      };
    }

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      logger.warn("GitHub GraphQL batch returned errors", {
        errorCount: payload.errors.length,
        sample: payload.errors[0]?.message ?? "unknown"
      });
    }

    const data = payload.data;
    if (!data || typeof data !== "object") {
      return {
        results: {},
        failed: true,
        error: "GraphQL payload did not contain data"
      };
    }

    const results: Record<string, GraphQlRepoData> = {};

    for (const [alias, repoData] of Object.entries(data)) {
      if (repoData) {
        const url = aliasMap[alias];
        results[url] = repoData as GraphQlRepoData;
      }
    }

    return { results, failed: false, error: null };
  }
  catch (error) {
    logger.error("GitHub GraphQL batch error", { error: getErrorMessage(error) });
    return {
      results: {},
      failed: true,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Helper to apply fallback data from previous run if available.
 */
function getFallbackOrOriginal(module: EnrichedModule, previousModulesMap: Map<string, EnrichedModule>): EnrichedModule {
  const previousModule = previousModulesMap.get(module.url);
  if (previousModule) {
    return {
      ...module,
      stars: previousModule.stars ?? 0,
      license: previousModule.license ?? null,
      hasGithubIssues: previousModule.hasGithubIssues ?? null,
      isArchived: previousModule.isArchived ?? null,
      lastCommit: previousModule.lastCommit ?? null
    };
  }
  return {
    ...module,
    hasGithubIssues: module.hasGithubIssues ?? null,
    isArchived: module.isArchived ?? null
  };
}

/**
 * Helper to fetch individual repository data.
 */
async function fetchIndividualModule(module: EnrichedModule, repoType: string, client: unknown): Promise<IndividualFetchResult> {
  try {
    const { response, data, branchData } = await fetchRepositoryData(module, client);

    if (response && !response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText || ""}`);
    }

    const normalized = normalizeRepositoryData(data, branchData, repoType);
    return { success: true, data: normalized };
  }
  catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

async function appendGitHubBatchResult({
  module,
  batchResults,
  batchFailed,
  previousModulesMap,
  stats,
  enrichedModules
}: AppendGitHubBatchResultOptions): Promise<void> {
  const repoData = batchResults[module.url];
  const repoId = getRepositoryId(module.url);

  if (repoData) {
    logger.debug(`GraphQL data for ${module.name}:`, {
      isArchived: repoData.isArchived,
      hasIssuesEnabled: repoData.hasIssuesEnabled,
      stargazerCount: repoData.stargazerCount
    });
    const normalized = normalizeRepositoryData(repoData, null, "github") as CachedRepositoryValue;
    repositoryCache.set(repoId, normalized);
    enrichedModules.push({ ...module, ...normalized });
    return;
  }

  if (!batchFailed) {
    logger.warn(`No data returned for ${module.name} in batch`, { url: module.url });
  }

  const recovery = await fetchIndividualModule(module, "github", httpClient);
  if (recovery.success) {
    const normalized = recovery.data;
    if (batchFailed) {
      logger.info(`Recovered ${module.name} via individual GitHub fetch after batch failure`);
    }
    repositoryCache.set(repoId, normalized);
    enrichedModules.push({ ...module, ...normalized });
    return;
  }

  logger.warn(`Failed to recover metadata for ${module.name}`, {
    url: module.url,
    error: recovery.error.message
  });

  const fallback = getFallbackOrOriginal(module, previousModulesMap);
  if (fallback !== module) {
    logger.info(`Using fallback data for ${module.name} (batch failure)`);
    stats.fallbacks += 1;
  }
  enrichedModules.push(fallback);

  repositoryCache.set(repoId, {
    isFailed: true,
    error: recovery.error.message
  }, NEGATIVE_CACHE_TTL_MS);
  stats.errors += 1;
}

/**
 * Process a single module: check cache, queue for batch, or fetch individually.
 * Returns the enriched module or null if queued for batch processing.
 */
async function processModule(module: EnrichedModule, context: ProcessModuleContext): Promise<EnrichedModule | null> {
  const {
    previousModulesMap,
    circuitBreaker,
    stats,
    githubModulesToFetch,
    client
  } = context;

  const repoId = getRepositoryId(module.url);
  const cachedEntry = repositoryCache.get(repoId) as CachedRepositoryEntry | null;

  if (!FORCE_REFRESH && cachedEntry) {
    stats.hits += 1;
    if (cachedEntry.value.isFailed) {
      const fallback = getFallbackOrOriginal(module, previousModulesMap);
      if (fallback !== module) {
        stats.fallbacks += 1;
      }
      return fallback;
    }
    return {
      ...module,
      ...cachedEntry.value
    };
  }

  stats.misses += 1;

  if (circuitBreaker.stopFetching) {
    const fallback = getFallbackOrOriginal(module, previousModulesMap);
    if (fallback !== module) {
      stats.fallbacks += 1;
    }
    return fallback;
  }

  const repoType = getRepositoryType(module.url);
  if (repoType === "github" && process.env.GITHUB_TOKEN) {
    githubModulesToFetch.push(module);
    return null;
  }

  // Fetch individual (non-GitHub or no token)
  const recovery = await fetchIndividualModule(module, repoType, client);

  if (recovery.success) {
    circuitBreaker.recordSuccess();
    repositoryCache.set(repoId, recovery.data);
    return {
      ...module,
      ...recovery.data
    };
  }

  logger.warn(`Failed to fetch metadata for ${module.name}`, { url: module.url, error: recovery.error.message });
  circuitBreaker.recordError(recovery.error);

  if (!circuitBreaker.stopFetching) {
    logger.info(`Using fallback data for ${module.name}`);
  }

  const fallback = getFallbackOrOriginal(module, previousModulesMap);
  if (fallback !== module) {
    stats.fallbacks += 1;
  }

  // Cache negative result
  repositoryCache.set(repoId, { isFailed: true, error: recovery.error.message }, NEGATIVE_CACHE_TTL_MS);
  stats.errors += 1;
  return fallback;
}

/**
 * Enrich the module list with repository metadata.
 */
async function enrichModules(modules: ParsedModuleEntry[], previousModulesMap: Map<string, EnrichedModule>): Promise<EnrichedModule[]> {
  const enrichedModules: EnrichedModule[] = [];
  const githubModulesToFetch: EnrichedModule[] = [];
  const stats: ModuleStats = { hits: 0, misses: 0, errors: 0, fallbacks: 0 };
  let processedCount = 0;
  const totalModules = modules.length;

  const circuitBreaker = {
    consecutive403Errors: 0,
    stopFetching: false,
    recordError(error: Error) {
      if (error.message.includes("403")) {
        this.consecutive403Errors += 1;
        if (this.consecutive403Errors >= 5) {
          logger.warn("Rate limit hit (403) multiple times. Stopping further API requests and using fallback data.");
          this.stopFetching = true;
        }
      }
      else {
        this.consecutive403Errors = 0;
      }
    },
    recordSuccess() {
      this.consecutive403Errors = 0;
    }
  };

  const context: ProcessModuleContext = {
    previousModulesMap,
    circuitBreaker,
    stats,
    githubModulesToFetch,
    client: httpClient
  };

  for (const module of modules) {
    processedCount += 1;
    if (processedCount % 50 === 0) {
      logger.info(`Processed ${processedCount}/${totalModules} modules (Cache/Pre-sort)...`);
    }

    const result = await processModule({ ...module }, context);
    if (result) {
      enrichedModules.push(result);
    }
  }

  if (githubModulesToFetch.length > 0) {
    logger.info(`Batch fetching ${githubModulesToFetch.length} GitHub repositories...`);
    for (let index = 0; index < githubModulesToFetch.length; index += GITHUB_GRAPHQL_BATCH_SIZE) {
      const chunk = githubModulesToFetch.slice(index, index + GITHUB_GRAPHQL_BATCH_SIZE);
      const { results: batchResults, failed: batchFailed, error: batchError } = await fetchGitHubBatch(chunk);

      if (batchFailed) {
        logger.warn("GitHub GraphQL chunk failed, retrying repositories individually", {
          chunkStart: index,
          chunkSize: chunk.length,
          error: batchError
        });
      }

      for (const module of chunk) {
        await appendGitHubBatchResult({
          module,
          batchResults,
          batchFailed,
          previousModulesMap,
          stats,
          enrichedModules
        });
      }
    }
  }

  logger.info("Metadata collection stats", stats);
  return enrichedModules;
}

async function main(): Promise<void> {
  try {
    await runCollectMetadata();
  }
  catch (error) {
    logger.error("Metadata collection failed", { error: getErrorMessage(error) });
    process.exit(1);
  }
}

function writeStage2Output(modules: EnrichedModule[], outputPath: string): string {
  fs.writeFileSync(outputPath, JSON.stringify(modules, null, 2));
  return outputPath;
}

export async function runCollectMetadata({
  markdown,
  outputPath = path.join("website", "data", "modules.stage.2.json"),
  outputWriter = writeStage2Output,
  previousModulesMap = loadPreviousModules()
}: RunCollectMetadataOptions = {}): Promise<RunCollectMetadataResult> {
  logger.info("Starting unified metadata collection...");

  if (!process.env.GITHUB_TOKEN) {
    logger.warn("GITHUB_TOKEN is not set. Rate limits will be strict and processing may be slow.");
  }

  const markdownSource = typeof markdown === "string" ? markdown : await fetchMarkdown();
  const { modules } = parseModuleList(markdownSource);
  logger.info(`Parsed ${modules.length} modules from Wiki.`);

  for (const module of modules) {
    if (module.category === "Outdated Modules" && !module.outdated) {
      module.outdated = "This module is marked as outdated in the official module list.";
    }
  }

  await repositoryCache.load();

  const enrichedModules = await enrichModules(modules, previousModulesMap);
  const currentModuleIds = new Set(enrichedModules.map(module => getRepositoryId(module.url)).filter(Boolean));
  const cachedEntries = repositoryCache.getAllKeys();
  let prunedCount = 0;

  for (const cachedId of cachedEntries) {
    if (!currentModuleIds.has(cachedId)) {
      repositoryCache.delete(cachedId);
      prunedCount += 1;
    }
  }

  if (prunedCount > 0) {
    logger.info(`Pruned ${prunedCount} orphaned cache entries for modules no longer in the Wiki`);
  }

  await repositoryCache.flush();
  const resolvedOutputPath = outputWriter
    ? await outputWriter(enrichedModules, outputPath)
    : null;

  if (resolvedOutputPath) {
    logger.info(`Successfully wrote ${enrichedModules.length} modules to ${resolvedOutputPath}`);
  }
  else {
    logger.info(`Collected ${enrichedModules.length} modules without writing stage-2 output file`);
  }

  return {
    modules: enrichedModules,
    outputPath: resolvedOutputPath
  };
}

const currentFile = fileURLToPath(import.meta.url);
const isMainEntry = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === currentFile;

if (isMainEntry) {
  main();
}
