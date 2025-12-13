// @ts-nocheck
import path from "node:path";
import fs from "node:fs";
import { rename, rm } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureRepository, GitErrorCategory, getCommitDate } from "./shared/git.js";
import { createHttpClient } from "./shared/http-client.js";
import { createLogger } from "./shared/logger.js";
import { createRateLimiter } from "./shared/rate-limiter.js";
import { ensureDirectory, fileExists, writeJson } from "./shared/fs-utils.js";
import { validateStageFile } from "./lib/schemaValidator.js";
import { stringifyDeterministic } from "./shared/deterministic-output.js";

type ModuleEntry = {
  name: string;
  url: string;
  description?: string;
  branch?: string;
  issues?: string[];
  [key: string]: unknown;
};

type UrlValidationResult = {
  module: ModuleEntry;
  statusCode: number | null;
  statusText?: string;
  ok: boolean;
  usedFallback?: boolean;
  initialStatusCode?: number | null;
  responseSnippet?: string;
  error?: string;
};

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const PROJECT_ROOT = path.resolve(currentDir, "..");

const MODULES_STAGE_2_PATH = path.join(
  PROJECT_ROOT,
  "website/data/modules.stage.2.json"
);
const MODULES_STAGE_3_PATH = path.join(
  PROJECT_ROOT,
  "website/data/modules.stage.3.json"
);
const SKIPPED_MODULES_PATH = path.join(
  PROJECT_ROOT,
  "website/data/skipped_modules.json"
);
const MODULES_DIR = path.join(PROJECT_ROOT, "modules");
const MODULES_TEMP_DIR = path.join(PROJECT_ROOT, "modules_temp");

const DEFAULT_URL_CONCURRENCY = 5;
const DEFAULT_URL_RATE = 15;
const URL_VALIDATION_RETRY_COUNT = 5;
const URL_VALIDATION_RETRY_DELAY_MS = 3000;
const RESPONSE_SNIPPET_MAX_LENGTH = 512;
const RESPONSE_SNIPPET_LOG_LENGTH = 200;
const REDIRECT_STATUS_CODES = new Set([301, 302, 307, 308]);

type CliOptions = {
  limit?: number;
  urlConcurrency: number;
  urlRate?: number;
  batchSize?: number;
};

function parsePositiveInteger(value?: string): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return undefined;
}

function findFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.findIndex((entry) => entry === flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function parseCliOptions(argv: string[]): CliOptions {
  const env = process.env;
  const limit =
    parsePositiveInteger(findFlagValue(argv, "--limit")) ??
    parsePositiveInteger(env.MODULE_URL_LIMIT);

  const urlConcurrency =
    parsePositiveInteger(findFlagValue(argv, "--url-concurrency")) ??
    parsePositiveInteger(env.MODULE_URL_CONCURRENCY) ??
    DEFAULT_URL_CONCURRENCY;

  const explicitRate =
    findFlagValue(argv, "--url-rate") ??
    (typeof env.MODULE_URL_RATE === "string" ? env.MODULE_URL_RATE : undefined);

  let disableRateLimiter = false;
  let parsedRate: number | undefined;

  if (typeof explicitRate === "string") {
    if (explicitRate.trim() === "0") {
      disableRateLimiter = true;
    } else {
      parsedRate = parsePositiveInteger(explicitRate);
    }
  }

  const normalizedConcurrency = Math.max(1, urlConcurrency);
  const batchSize =
    parsePositiveInteger(findFlagValue(argv, "--batch-size")) ??
    parsePositiveInteger(env.MODULE_BATCH_SIZE) ??
    200; // sensible default batch size

  return {
    limit,
    urlConcurrency: normalizedConcurrency,
    urlRate: disableRateLimiter ? undefined : (parsedRate ?? DEFAULT_URL_RATE),
    batchSize
  };
}

const cliOptions = parseCliOptions(process.argv.slice(2));
const logger = createLogger({ name: "get-modules" });

function logMemoryUsage(label: string) {
  const usage = process.memoryUsage();
  const heapUsedMb = (usage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMb = (usage.heapTotal / 1024 / 1024).toFixed(2);
  const rssMb = (usage.rss / 1024 / 1024).toFixed(2);
  logger.info(`[Memory] ${label}: RSS=${rssMb}MB, Heap=${heapUsedMb}MB/${heapTotalMb}MB`);
}

function logErrorDetails(error: unknown, { scope }: { scope: string }) {
  if (error instanceof Error) {
    const stack = error.stack ?? error.message;
    logger.error(`${scope}: ${error.message}`);
    if (stack && stack !== error.message) {
      logger.error(`Stack trace:\n${stack}`);
    }

    if (error.cause) {
      const causeMessage = error.cause instanceof Error
        ? error.cause.stack ?? error.cause.message
        : String(error.cause);
      logger.error(`Caused by: ${causeMessage}`);
    }
  } else {
    logger.error(`${scope}: ${String(error)}`);
  }
}

function installGlobalErrorHandlers() {
  process.on("unhandledRejection", (reason) => {
    logErrorDetails(reason, { scope: "Unhandled promise rejection" });
    process.exitCode = 1;
  });

  process.on("uncaughtException", (error) => {
    logErrorDetails(error, { scope: "Uncaught exception" });
    process.exitCode = 1;
  });
}

installGlobalErrorHandlers();

const rateLimiter =
  cliOptions.urlRate && cliOptions.urlRate > 0
    ? createRateLimiter({
      tokensPerInterval: cliOptions.urlRate,
      intervalMs: 1000,
      maxTokens: cliOptions.urlRate
    })
    : null;
const httpClient = createHttpClient(rateLimiter ? { rateLimiter } : {});

async function rotateModulesDirectory() {
  const modulesExists = await fileExists(MODULES_DIR);

  if (modulesExists) {
    await rm(MODULES_TEMP_DIR, { recursive: true, force: true });
    await rename(MODULES_DIR, MODULES_TEMP_DIR);
  } else {
    await ensureDirectory(MODULES_TEMP_DIR);
  }

  await ensureDirectory(MODULES_DIR);
}

function extractModules(data: unknown): ModuleEntry[] {
  if (Array.isArray(data)) {
    return data as ModuleEntry[];
  }

  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>).modules)
  ) {
    return (data as { modules: ModuleEntry[] }).modules;
  }

  throw new Error(
    "modules.stage.2.json must contain either an object with a 'modules' property or a list of modules."
  );
}

function extractOwnerFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    return segments[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

function isSuccessStatus(status: number | null | undefined) {
  return typeof status === "number" && status >= 200 && status < 300;
}

function isAllowedRedirect(status: number | null | undefined) {
  return typeof status === "number" && REDIRECT_STATUS_CODES.has(status);
}

function formatSnippetForLog(snippet?: string) {
  if (!snippet) {
    return "<empty response>";
  }

  return snippet
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RESPONSE_SNIPPET_LOG_LENGTH);
}

async function readSnippet(response: Response) {
  try {
    const text = await response.text();
    if (!text) {
      return undefined;
    }
    return text.slice(0, RESPONSE_SNIPPET_MAX_LENGTH);
  } catch {
    return undefined;
  }
}

async function fetchFallbackPreview(url: string) {
  try {
    const response = await httpClient.request(url, {
      method: "GET",
      redirect: "manual",
      retries: 1,
      retryDelayMs: URL_VALIDATION_RETRY_DELAY_MS
    });
    const snippet = await readSnippet(response);
    return {
      statusCode: response.status,
      statusText: response.statusText,
      snippet
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`Fallback GET failed for ${url}: ${message}`);
    return undefined;
  }
}

async function validateModuleUrl(
  module: ModuleEntry
): Promise<UrlValidationResult> {
  logger.info(`=== DIAGNOSTIC: validateModuleUrl called for ${module.name} (${module.url}) ===`);
  
  try {
    logger.info(`=== DIAGNOSTIC: Making HEAD request to ${module.url} ===`);
    const headResponse = await httpClient.request(module.url, {
      method: "HEAD",
      redirect: "manual",
      retries: URL_VALIDATION_RETRY_COUNT,
      retryDelayMs: URL_VALIDATION_RETRY_DELAY_MS
    });

    logger.info(`=== DIAGNOSTIC: HEAD response received: ${headResponse.status} ${headResponse.statusText} ===`);

    const headSnippet = await readSnippet(headResponse);
    const headStatus = headResponse.status;
    const headStatusText = headResponse.statusText;

    if (isSuccessStatus(headStatus) || isAllowedRedirect(headStatus)) {
      logger.info(`=== DIAGNOSTIC: URL ${module.url} validated successfully ===`);
      return {
        module,
        statusCode: headStatus,
        statusText: headStatusText,
        ok: true,
        responseSnippet: headSnippet
      };
    }

    logger.info(`=== DIAGNOSTIC: HEAD failed with ${headStatus}, trying fallback GET ===`);
    const fallbackPreview = await fetchFallbackPreview(module.url);
    if (
      fallbackPreview &&
      (isSuccessStatus(fallbackPreview.statusCode) ||
        isAllowedRedirect(fallbackPreview.statusCode))
    ) {
      logger.warn(
        `URL ${module.url} rejected HEAD (${headStatus} ${headStatusText}) but accepted fallback GET (${fallbackPreview.statusCode} ${fallbackPreview.statusText}).`
      );
      return {
        module,
        statusCode: fallbackPreview.statusCode ?? headStatus,
        statusText: fallbackPreview.statusText ?? headStatusText,
        ok: true,
        usedFallback: true,
        initialStatusCode: headStatus,
        responseSnippet: fallbackPreview.snippet ?? headSnippet
      };
    }

    const snippet = fallbackPreview?.snippet ?? headSnippet;
    const finalStatusCode = fallbackPreview?.statusCode ?? headStatus;
    const finalStatusText = fallbackPreview?.statusText ?? headStatusText;

    logger.warn(
      `URL ${module.url} failed validation (${finalStatusCode} ${finalStatusText}). Sample: ${formatSnippetForLog(snippet)}`
    );

    return {
      module,
      statusCode: finalStatusCode,
      statusText: finalStatusText,
      ok: false,
      initialStatusCode: headStatus,
      responseSnippet: snippet
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`=== DIAGNOSTIC: Exception in validateModuleUrl for ${module.url}: ${message} ===`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack: ${error.stack}`);
    }
    logger.warn(`URL ${module.url}: ${message}`);
    return {
      module,
      statusCode: null,
      statusText: undefined,
      ok: false,
      error: message
    };
  }
}

async function validateModuleUrls({
  modules,
  limit,
  urlConcurrency
}: {
  modules: ModuleEntry[];
  limit?: number;
  urlConcurrency: number;
}) {
  logger.info("=== DIAGNOSTIC: validateModuleUrls called ===");
  logger.info(`Total modules: ${modules.length}, limit: ${limit}, concurrency: ${urlConcurrency}`);
  
  const total =
    typeof limit === "number"
      ? Math.min(limit, modules.length)
      : modules.length;
  const targets = typeof limit === "number" ? modules.slice(0, total) : modules;

  if (targets.length === 0) {
    logger.info("No modules to validate");
    return [];
  }

  logger.info(`=== DIAGNOSTIC: About to validate ${targets.length} modules ===`);
  
  const results: UrlValidationResult[] = new Array(targets.length);
  let nextIndex = 0;
  let completed = 0;

  const progressInterval = Math.max(10, Math.ceil(total / 10));

  async function worker() {
    logger.info("=== DIAGNOSTIC: Worker started ===");
    for (;;) {
      const currentIndex = nextIndex;
      if (currentIndex >= targets.length) {
        break;
      }
      nextIndex += 1;

      const module = targets[currentIndex];
      logger.info(`=== DIAGNOSTIC: Validating module ${currentIndex + 1}/${targets.length}: ${module.name} - ${module.url} ===`);
      
      try {
        const result = await validateModuleUrl(module);
        results[currentIndex] = result;
        completed += 1;
        
        logger.info(`=== DIAGNOSTIC: Completed ${completed}/${total} ===`);

        if (completed % progressInterval === 0 || completed === total) {
          logger.info(
            `Progress: ${completed}/${total} URLs validated (concurrency=${urlConcurrency})`
          );
          logMemoryUsage(`Progress: ${completed}/${total}`);
        }
      } catch (error) {
        logger.error(`=== DIAGNOSTIC: Error validating ${module.name}: ${error} ===`);
        throw error;
      }
    }
    logger.info("=== DIAGNOSTIC: Worker finished ===");
  }

  const workerCount = Math.min(urlConcurrency, targets.length);
  logger.info(`=== DIAGNOSTIC: Starting ${workerCount} workers ===`);
  
  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    logger.info("=== DIAGNOSTIC: All workers completed successfully ===");
  } catch (error) {
    logger.error(`=== DIAGNOSTIC: Worker pool error: ${error} ===`);
    throw error;
  }

  return results;
}

function ensureIssueArray(module: ModuleEntry) {
  if (!Array.isArray(module.issues)) {
    module.issues = [];
  }
}

function createSkippedEntry(
  module: ModuleEntry,
  reason: string,
  errorType: string,
  details: {
    statusCode?: number | null;
    statusText?: string;
    responseSnippet?: string;
    initialStatusCode?: number | null;
    error?: string;
    category?: string;
  } = {}
) {
  const owner = extractOwnerFromUrl(module.url);
  const normalizedDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined)
  );
  
  // Build metadata object for categorization
  const metadata: Record<string, unknown> = {
    errorType
  };
  
  if (details.error) {
    metadata.error = details.error;
  }
  
  if (details.category) {
    metadata.category = details.category;
  }
  
  return {
    name: module.name,
    url: module.url,
    maintainer: owner,
    description:
      typeof module.description === "string" ? module.description : "",
    reason,
    metadata,
    ...Object.fromEntries(
      Object.entries(normalizedDetails).filter(([key]) => 
        !['error', 'category'].includes(key)
      )
    )
  };
}

/**
 * Refreshes the checked-out repository for a module. We clone/fetch into the
 * module's temporary workspace (`modules_temp/<identifier>`) first so we never
 * mutate the primary `modules/` directory until the operation succeeds. Once
 * the update is complete the temp folder is atomically renamed into
 * `modules/<identifier>`.
 */
async function refreshRepository({
  module,
  tempPath,
  finalPath
}: {
  module: ModuleEntry;
  tempPath: string;
  finalPath: string;
}) {
  const branch =
    typeof module.branch === "string" && module.branch.length > 0
      ? module.branch
      : undefined;

  try {
    await ensureRepository({
      repositoryUrl: module.url,
      directoryPath: tempPath,
      branch,
      depth: 1
    });
  } catch (error) {
    // Add context to the error for better debugging
    const message = error instanceof Error ? error.message : String(error);
    const enhancedError = new Error(
      `Failed to clone repository ${module.url}${branch ? ` (branch: ${branch})` : ""}: ${message}`
    );
    if (error instanceof Error && error.stack) {
      enhancedError.stack = error.stack;
    }
    throw enhancedError;
  }

  await ensureDirectory(path.dirname(finalPath));
  if (await fileExists(finalPath)) {
    await rm(finalPath, { recursive: true, force: true });
  }

  await rename(tempPath, finalPath);
}

async function writeOutputs({
  validModules,
  skippedModules
}: {
  validModules: ModuleEntry[];
  skippedModules: ReturnType<typeof createSkippedEntry>[];
}) {
  // Always write the stage 3 file, even if no modules were successfully cloned
  // This allows the pipeline to continue even if this stage had issues
  logger.info(`Writing stage 3 output with ${validModules.length} valid modules`);
  await writeJson(
    MODULES_STAGE_3_PATH,
    { modules: validModules },
    { pretty: 2 }
  );

  logger.info(`Writing ${skippedModules.length} skipped modules to ${SKIPPED_MODULES_PATH}`);
  await writeJson(SKIPPED_MODULES_PATH, skippedModules, { pretty: 2 });

  // Validate the output file - this will throw if the file is invalid
  // but at least the file exists now
  try {
    await validateStageFile("modules.stage.3", MODULES_STAGE_3_PATH);
    logger.info("Stage 3 output file validated successfully");
  } catch (validationError) {
    logger.warn("Stage 3 output file validation failed, but file was written");
    logErrorDetails(validationError, { scope: "Stage 3 validation" });
    // Don't throw here - we want the file to exist even if validation fails
  }
}

async function processModules() {
  logger.info("Validating stage 2 input");
  const stageData = await validateStageFile(
    "modules.stage.2",
    MODULES_STAGE_2_PATH
  );
  const modules = extractModules(stageData);
  logMemoryUsage("Initial");

  logger.info(`Loaded ${modules.length} modules from stage 2`);

  const totalTargets =
    typeof cliOptions.limit === "number"
      ? Math.min(cliOptions.limit, modules.length)
      : modules.length;
  const rateLabel =
    typeof cliOptions.urlRate === "number" && cliOptions.urlRate > 0
      ? `${cliOptions.urlRate} req/s`
      : "disabled";
  logger.info(
    `Validating up to ${totalTargets} module URLs (concurrency=${cliOptions.urlConcurrency}, rate-limit=${rateLabel})`
  );

  // We'll stream-valid outputs in batches to avoid keeping all results in memory.
  const validModules: ModuleEntry[] = [];
  const skippedModules: ReturnType<typeof createSkippedEntry>[] = [];
  let moduleCounter = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  // Use try-finally to ensure output is written even if errors occur
  try {
    await ensureDirectory(MODULES_DIR);

    // Open a temporary stream for stage 3 output so we can append batches
    const tmpPath = `${MODULES_STAGE_3_PATH}.tmp`;
    const writeStream = await (async function createStream() {
      await ensureDirectory(path.dirname(tmpPath));
      const ws = fs.createWriteStream(tmpPath, { encoding: "utf8" });
      ws.write("{\"modules\":[");
      return ws;
    })();

    let firstOut = true;

    // Process modules in batches to bound memory and parallelism
    const batchSize = cliOptions.batchSize ?? 200;
    for (let start = 0; start < totalTargets; start += batchSize) {
      const end = Math.min(start + batchSize, totalTargets);
      const chunk = modules.slice(start, end);

      logger.info(`Processing modules ${start + 1}-${end} / ${totalTargets} (batchSize=${batchSize})`);

      const validated = await validateModuleUrls({
        modules: chunk,
        urlConcurrency: cliOptions.urlConcurrency
      });

      for (const {
        module,
        ok,
        statusCode,
        statusText,
        responseSnippet,
        usedFallback,
        initialStatusCode
      } of validated) {
      if (!ok) {
        skippedModules.push(
          createSkippedEntry(module, "Invalid repository URL", "invalid_url", {
            statusCode,
            statusText,
            responseSnippet,
            initialStatusCode
          })
        );
        continue;
      }

      const owner = extractOwnerFromUrl(module.url);
      const identifier = `${module.name}-----${owner}`;
      const tempPath = path.join(MODULES_TEMP_DIR, identifier);
      const finalPath = path.join(MODULES_DIR, identifier);

      const moduleCopy: ModuleEntry = { ...module };

      if (statusCode && REDIRECT_STATUS_CODES.has(statusCode)) {
        ensureIssueArray(moduleCopy);
        moduleCopy.issues?.push(
          statusCode === 301
            ? "The repository URL returns a 301 status code, indicating it has been moved. Please verify the new location and update the module list if necessary."
            : `The repository URL returned a ${statusCode} redirect during validation. Please confirm the final destination and update the module list if necessary.`
        );
      }

      if (usedFallback) {
        ensureIssueArray(moduleCopy);
        moduleCopy.issues?.push(
          "HEAD requests to this repository failed but a subsequent GET request succeeded. Please verify the repository URL and server configuration."
        );
      }

      moduleCounter += 1;
      logger.info(
        `+++   ${moduleCounter.toString().padStart(4, " ")}: ${module.name} by ${owner} - ${module.url}`
      );

      try {
        // Optimization: Check if we can skip cloning based on lastCommit date
        let shouldSkipClone = false;
        if (module.lastCommit && await fileExists(finalPath)) {
          try {
            const localDateStr = await getCommitDate({ cwd: finalPath });
            if (localDateStr) {
              const localDate = new Date(localDateStr);
              const remoteDate = new Date(module.lastCommit);
              
              // If local repo is at least as new as the remote info we have, skip clone
              // We use a small buffer (e.g. 1 minute) to handle potential clock skew or precision issues
              if (localDate.getTime() >= remoteDate.getTime() - 60000) {
                shouldSkipClone = true;
                logger.info(`Skipping clone for ${module.name}: Local repo is up to date (${localDateStr} >= ${module.lastCommit})`);
              }
            }
          } catch (dateError) {
            logger.debug(`Could not verify local commit date for ${module.name}, proceeding with clone: ${dateError.message}`);
          }
        }

        if (!shouldSkipClone) {
          await refreshRepository({ module: moduleCopy, tempPath, finalPath });
        }
        
        // Write moduleCopy to stream immediately to avoid holding it
        // Use deterministic stringify to ensure sorted keys for reproducible outputs
        const toWrite = `${firstOut ? "" : ","}${stringifyDeterministic(moduleCopy, null)}`;
        writeStream.write(toWrite);
        firstOut = false;
        validModules.push(moduleCopy);
        consecutiveErrors = 0; // Reset error counter on success
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Determine if this is an infrastructure error (should count toward circuit breaker)
        // or an expected error (404, auth, etc. - should just skip)
        const errorCategory = error?.category || GitErrorCategory.UNKNOWN;
        const isInfrastructureError = 
          errorCategory === GitErrorCategory.NETWORK || 
          errorCategory === GitErrorCategory.INFRASTRUCTURE;

        if (isInfrastructureError) {
          consecutiveErrors += 1;
          logger.error(
            `Infrastructure error for module [${moduleCounter}/${validated.length}]: ${module.name} (${module.url})`
          );
        } else {
          logger.warn(
            `Skipping module [${moduleCounter}/${validated.length}]: ${module.name} (${module.url}) - ${errorCategory}`
          );
        }
        
        logger.error(`Error: ${message}`);
        
        if (errorStack && errorStack !== message) {
          logger.debug(`Stack trace: ${errorStack}`);
        }

        await rm(tempPath, { recursive: true, force: true }).catch(() => {});
        
        // Provide more specific skip reason based on error category
        let skipReason = "Repository clone failed - URL might be invalid or repository might be private/deleted";
        if (errorCategory === GitErrorCategory.NOT_FOUND) {
          skipReason = "Repository not found - it may have been deleted, renamed, or made private";
        } else if (errorCategory === GitErrorCategory.AUTHENTICATION) {
          skipReason = "Repository access denied - it may be private or require authentication";
        } else if (errorCategory === GitErrorCategory.NETWORK) {
          skipReason = "Network error - timeout or connection failure";
        } else if (errorCategory === GitErrorCategory.INFRASTRUCTURE) {
          skipReason = "Infrastructure error - rate limit or server error";
        }

        skippedModules.push(
          createSkippedEntry(
            module,
            skipReason,
            "clone_failure",
            { error: message, category: errorCategory }
          )
        );

        // If we have too many consecutive infrastructure errors, something might be systematically wrong
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error(
            `Encountered ${MAX_CONSECUTIVE_ERRORS} consecutive infrastructure errors. This indicates a systematic issue (network problems, rate limiting, etc.).`
          );
          logger.error(
            `Aborting to prevent further damage. Please check network connectivity and API rate limits.`
          );
          throw new Error(
            `Too many consecutive infrastructure errors (${MAX_CONSECUTIVE_ERRORS}). Aborting pipeline.`
          );
        }
        
        continue;
      }
    }

      // After processing chunk, log and optionally free memory by trimming arrays
      logger.info(`Finished batch ${start + 1}-${end}: valid so far=${validModules.length}, skipped so far=${skippedModules.length}`);
      logMemoryUsage(`After batch ${start + 1}-${end}`);
    }

    // Close stream and finalize JSON
    await new Promise((resolve) => writeStream.end("]}", "utf8", resolve));

    // Generate summary report
    const categoryCount = skippedModules.reduce((acc, mod) => {
      const category = mod.metadata?.category || "UNKNOWN";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info("");
    logger.info("=".repeat(60));
    logger.info("Stage 3 (get-modules) Summary");
    logger.info("=".repeat(60));
    logger.info(`✅ Modules cloned successfully: ${validModules.length}`);
    
    if (skippedModules.length > 0) {
      logger.warn(`⚠️  Modules skipped: ${skippedModules.length}`);
      
      // Show breakdown by category
      const categories = [
        { key: "NOT_FOUND", label: "Repository not found (deleted/renamed)" },
        { key: "AUTHENTICATION", label: "Access denied (private)" },
        { key: "NETWORK", label: "Network errors" },
        { key: "INFRASTRUCTURE", label: "Infrastructure errors" },
        { key: "UNKNOWN", label: "Unknown errors" }
      ];
      
      for (const { key, label } of categories) {
        const count = categoryCount[key] || 0;
        if (count > 0) {
          logger.warn(`   ├─ ${key}: ${count} (${label})`);
        }
      }
      
      logger.warn("");
      logger.warn("⚠️  WARNING: Skipped modules won't appear in the final module list.");
      logger.warn(`   Check ${SKIPPED_MODULES_PATH} for details.`);
      logger.warn("   Consider reviewing and updating the wiki if repositories were deleted.");
    } else {
      logger.info(`✅ Modules skipped: 0`);
    }
    
    logger.info(`📊 Total processed: ${validModules.length + skippedModules.length}/${totalTargets}`);
    logger.info("=".repeat(60));
    logger.info("");
  } finally {
    // Always write output, even if errors occurred
    logMemoryUsage("Pre-write");
    logger.info("Writing output files...");
    try {
      const tmpPath = `${MODULES_STAGE_3_PATH}.tmp`;
      if (fs.existsSync(tmpPath)) {
        // Atomically move temp file into place
        await rename(tmpPath, MODULES_STAGE_3_PATH);

        // We also need to write skipped modules, as the stream only handled valid modules
        logger.info(`Writing ${skippedModules.length} skipped modules to ${SKIPPED_MODULES_PATH}`);
        await writeJson(SKIPPED_MODULES_PATH, skippedModules, { pretty: 2 });
      } else {
        await writeOutputs({ validModules, skippedModules });
      }
      logger.info("Output files written successfully");
    } catch (writeError) {
      logger.error("Failed to write output files");
      logErrorDetails(writeError, { scope: "writeOutputs" });
      throw writeError;
    }
    logMemoryUsage("Post-write");
  }
}

async function main() {
  await rotateModulesDirectory();
  await processModules();
}

main().catch((error) => {
  logger.error("Stage 'get-modules' failed");
  logErrorDetails(error, { scope: "Fatal error" });
  process.exitCode = 1;
});
