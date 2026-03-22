#!/usr/bin/env node

import { buildResultMarkdown, collectIssueSummaries } from "./check-modules/result-markdown.ts";
import { createLogger } from "./shared/logger.ts";
import { ensureDirectory, readJson } from "./shared/fs-utils.ts";
import { dirname, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import process from "node:process";

interface Stage5ModuleCollection {
  modules?: unknown[];
}

interface ResultMarkdownStats {
  issueCounter: number;
  lastUpdate: string;
  maintainer: Record<string, number>;
  moduleCounter: number;
  modulesWithIssuesCounter: number;
  repositoryHoster: Record<string, number>;
}

interface ResultMarkdownLogger {
  info: (message: string, data?: unknown) => void;
}

interface GenerateResultMarkdownOptions {
  projectRoot?: string;
  resultPath?: string;
  runLogger?: ResultMarkdownLogger;
  stage5Modules?: unknown[];
  stats?: ResultMarkdownStats;
}

const logger = createLogger({ name: "generate-result-markdown" });
const PROJECT_ROOT = resolve(process.cwd());

function normalizeStage5Modules(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as Stage5ModuleCollection).modules)) {
    return (payload as Stage5ModuleCollection).modules ?? [];
  }

  throw new TypeError("modules.stage.5.json must contain either an array or an object with a modules array");
}

async function readStage5ModulesOrEmpty(projectRoot: string): Promise<unknown[]> {
  const stage5Path = resolve(projectRoot, "website", "data", "modules.stage.5.json");

  try {
    const payload = await readJson(stage5Path);
    return normalizeStage5Modules(payload);
  }
  catch (error) {
    const isMissingFile =
      error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";

    if (isMissingFile) {
      logger.warn(`Stage-5 file missing at ${stage5Path}; generating result.md with empty issue details.`);
      return [];
    }

    throw error;
  }
}

export async function runGenerateResultMarkdown({
  projectRoot = PROJECT_ROOT,
  resultPath,
  runLogger = logger,
  stage5Modules,
  stats
}: GenerateResultMarkdownOptions = {}): Promise<{ issueCount: number; outputPath: string }> {
  const outputPath = resultPath ?? resolve(projectRoot, "website", "result.md");
  const resolvedStage5Modules = stage5Modules
    ?? await readStage5ModulesOrEmpty(projectRoot);
  const resolvedStats = stats
    ?? await readJson<ResultMarkdownStats>(resolve(projectRoot, "website", "data", "stats.json"));
  const summaries = collectIssueSummaries(resolvedStage5Modules);
  const markdown = buildResultMarkdown(resolvedStats, summaries);

  await ensureDirectory(dirname(outputPath));
  await writeFile(outputPath, markdown, "utf8");
  runLogger.info(`Generated result markdown at ${outputPath}`);

  return {
    issueCount: summaries.length,
    outputPath
  };
}

async function main(): Promise<void> {
  await runGenerateResultMarkdown();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exit(1);
});