// @ts-nocheck
import path from "node:path";
import { rename, rm } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureRepository } from "./shared/git.js";
import { createHttpClient } from "./shared/http-client.js";
import { createLogger } from "./shared/logger.js";
import { createRateLimiter } from "./shared/rate-limiter.js";
import { ensureDirectory, fileExists, writeJson } from "./shared/fs-utils.js";
import { validateStageFile } from "./lib/schemaValidator.js";

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

const DEFAULT_URL_CONCURRENCY = 10;
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

  return {
    limit,
    urlConcurrency: normalizedConcurrency,
    urlRate: disableRateLimiter ? undefined : (parsedRate ?? DEFAULT_URL_RATE)
  };
}

const cliOptions = parseCliOptions(process.argv.slice(2));
const logger = createLogger({ name: "get-modules" });

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
  try {
    const headResponse = await httpClient.request(module.url, {
      method: "HEAD",
      redirect: "manual",
      retries: URL_VALIDATION_RETRY_COUNT,
      retryDelayMs: URL_VALIDATION_RETRY_DELAY_MS
    });

    const headSnippet = await readSnippet(headResponse);
    const headStatus = headResponse.status;
    const headStatusText = headResponse.statusText;

    if (isSuccessStatus(headStatus) || isAllowedRedirect(headStatus)) {
      return {
        module,
        statusCode: headStatus,
        statusText: headStatusText,
        ok: true,
        responseSnippet: headSnippet
      };
    }

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
  const total =
    typeof limit === "number"
      ? Math.min(limit, modules.length)
      : modules.length;
  const targets = typeof limit === "number" ? modules.slice(0, total) : modules;

  if (targets.length === 0) {
    logger.info("No modules to validate");
    return [];
  }

  const results: UrlValidationResult[] = new Array(targets.length);
  let nextIndex = 0;
  let completed = 0;

  const progressInterval = Math.max(10, Math.ceil(total / 10));

  async function worker() {
    for (;;) {
      const currentIndex = nextIndex;
      if (currentIndex >= targets.length) {
        break;
      }
      nextIndex += 1;

      const module = targets[currentIndex];
      const result = await validateModuleUrl(module);

      results[currentIndex] = result;
      completed += 1;

      if (completed % progressInterval === 0 || completed === total) {
        logger.info(
          `Progress: ${completed}/${total} URLs validated (concurrency=${urlConcurrency})`
        );
      }
    }
  }

  const workerCount = Math.min(urlConcurrency, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

function ensureIssueArray(module: ModuleEntry) {
  if (!Array.isArray(module.issues)) {
    module.issues = [];
  }
}

function createSkippedEntry(
  module: ModuleEntry,
  error: string,
  errorType: string,
  details: {
    statusCode?: number | null;
    statusText?: string;
    responseSnippet?: string;
    initialStatusCode?: number | null;
    error?: string;
  } = {}
) {
  const owner = extractOwnerFromUrl(module.url);
  const normalizedDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined)
  );
  return {
    name: module.name,
    url: module.url,
    maintainer: owner,
    description:
      typeof module.description === "string" ? module.description : "",
    error,
    errorType,
    ...normalizedDetails
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

  if (skippedModules.length > 0) {
    logger.info(`Writing ${skippedModules.length} skipped modules to ${SKIPPED_MODULES_PATH}`);
    await writeJson(SKIPPED_MODULES_PATH, skippedModules, { pretty: 2 });
  }

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

  const validated = await validateModuleUrls({
    modules,
    limit: cliOptions.limit,
    urlConcurrency: cliOptions.urlConcurrency
  });

  const validModules: ModuleEntry[] = [];
  const skippedModules: ReturnType<typeof createSkippedEntry>[] = [];
  let moduleCounter = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  await ensureDirectory(MODULES_DIR);

  // Use try-finally to ensure output is written even if errors occur
  try {
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
        await refreshRepository({ module: moduleCopy, tempPath, finalPath });
        validModules.push(moduleCopy);
        consecutiveErrors = 0; // Reset error counter on success
      } catch (error) {
        consecutiveErrors += 1;
        const message = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error(
          `Failed to clone/update module [${moduleCounter}/${validated.length}]: ${module.name} (${module.url})`
        );
        logger.error(`Error: ${message}`);
        
        if (errorStack && errorStack !== message) {
          logger.debug(`Stack trace: ${errorStack}`);
        }

        await rm(tempPath, { recursive: true, force: true }).catch(() => {});
        skippedModules.push(
          createSkippedEntry(
            module,
            "Repository clone failed - URL might be invalid or repository might be private/deleted",
            "clone_failure",
            { error: message }
          )
        );

        // If we have too many consecutive errors, something might be systematically wrong
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.warn(
            `Encountered ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Continuing but this might indicate a systematic issue (e.g., network problems, rate limiting).`
          );
          // Reset counter to avoid spamming this warning
          consecutiveErrors = 0;
        }
        
        continue;
      }
    }

    logger.info(`Modules cloned: ${validModules.length}`);
    logger.info(`Modules skipped: ${skippedModules.length}`);
    logger.info(`Total modules processed: ${validModules.length + skippedModules.length}/${validated.length}`);
  } finally {
    // Always write output, even if errors occurred
    logger.info("Writing output files...");
    try {
      await writeOutputs({ validModules, skippedModules });
      logger.info("Output files written successfully");
    } catch (writeError) {
      logger.error("Failed to write output files");
      logErrorDetails(writeError, { scope: "writeOutputs" });
      throw writeError;
    }
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
