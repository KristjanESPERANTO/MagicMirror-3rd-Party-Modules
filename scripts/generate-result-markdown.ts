#!/usr/bin/env node

import { buildResultMarkdown, collectIssueSummaries } from "./check-modules/result-markdown.ts";
import { createLogger } from "./shared/logger.ts";
import { ensureDirectory, readJson } from "./shared/fs-utils.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import process from "node:process";

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
  processedModules?: unknown[];
  stats?: ResultMarkdownStats;
}

const logger = createLogger({ name: "generate-result-markdown" });
const PROJECT_ROOT = resolve(process.cwd());

export async function runGenerateResultMarkdown({
  projectRoot = PROJECT_ROOT,
  resultPath,
  runLogger = logger,
  processedModules,
  stats
}: GenerateResultMarkdownOptions = {}): Promise<{ issueCount: number; outputPath: string }> {
  if (!Array.isArray(processedModules)) {
    throw new TypeError("runGenerateResultMarkdown requires processedModules from the in-memory pipeline handoff");
  }

  const outputPath = resultPath ?? resolve(projectRoot, "website", "result.md");
  const resolvedStats = stats
    ?? await readJson<ResultMarkdownStats>(resolve(projectRoot, "website", "data", "stats.json"));
  const summaries = collectIssueSummaries(processedModules);
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
  throw new Error("generate-result-markdown must be executed via the orchestrator; direct per-module file input is no longer supported");
}

const currentFile = fileURLToPath(import.meta.url);
const isMainEntry = Boolean(process.argv[1]) && resolve(process.argv[1]) === currentFile;

if (isMainEntry) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exit(1);
  });
}