import {
  buildBenchmarkSummary,
  printBenchmarkSummary,
  selectBenchmarkRecords
} from "./benchmark.ts";
import {
  buildDashboardSummary,
  printDashboardSummary,
  selectDashboardRecords
} from "./dashboard.ts";
import {
  buildProgressSummary,
  printProgressSummary,
  selectProgressRecords
} from "./progress.ts";
import {
  describePipeline,
  describeStage,
  listRunRecordFiles,
  loadGraphMetadata,
  printPipelineSummaries,
  printRunRecordDetails,
  printStageSummaries,
  readRunRecord
} from "./cli-helpers.ts";
import type { PipelineRunRecord, RunRecordFileInfo } from "./cli-helpers.ts";
import type { Command } from "commander";
import path from "node:path";
import process from "node:process";

interface MinimumNodeVersion {
  major: number;
  minor?: number;
  patch?: number;
}

interface CheckResult {
  details: string;
  status: "fail" | "pass" | "warn";
}

interface LoadedPipelineRunRecord extends PipelineRunRecord {
  mtimeMs: number;
}

type ExecFileAsync = (
  command: string,
  args: string[],
  options: { timeout: number }
) => Promise<{ stdout: string; stderr: string }>;

interface OrchestratorContext {
  defaultGraphPath: string;
  execFileAsync: ExecFileAsync;
  minNodeVersion: MinimumNodeVersion;
  projectRoot: string;
  runsDirectory: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

async function loadRunRecords(runsDirectory: string): Promise<{
  loadedRecords: LoadedPipelineRunRecord[];
  runRecordFiles: RunRecordFileInfo[];
}> {
  const runRecordFiles = await listRunRecordFiles(runsDirectory);

  if (runRecordFiles.length === 0) {
    return { loadedRecords: [], runRecordFiles };
  }

  const loadedRecords: LoadedPipelineRunRecord[] = [];
  for (const recordInfo of runRecordFiles) {
    const record = await readRunRecord(recordInfo.path);
    loadedRecords.push({
      ...record,
      mtimeMs: recordInfo.mtimeMs,
      runFile: recordInfo.name
    });
  }

  return { loadedRecords, runRecordFiles };
}

function formatMinimumNodeVersion(minimumVersion: MinimumNodeVersion): string {
  const minor = minimumVersion.minor ?? 0;
  const patch = minimumVersion.patch ?? 0;

  return `${minimumVersion.major}.${minor}.${patch}`;
}

function checkNodeVersion(minimumVersion: MinimumNodeVersion): CheckResult {
  const raw = process.versions.node;
  const [majorPart, minorPart] = raw.split(".");
  const major = Number.parseInt(majorPart, 10);
  const minor = Number.parseInt(minorPart ?? "0", 10);

  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return {
      status: "warn",
      details: `Unable to parse Node.js version (${raw}).`
    };
  }

  const belowMajor = major < minimumVersion.major;
  const belowMinor = major === minimumVersion.major && minor < (minimumVersion.minor ?? 0);

  if (belowMajor || belowMinor) {
    return {
      status: "fail",
      details: `Detected Node.js ${raw}. Requires >= ${formatMinimumNodeVersion(minimumVersion)}.`
    };
  }

  return {
    status: "pass",
    details: raw
  };
}

function printCheckResult({ label, status, details }: { details?: string; label: string; status: "fail" | "pass" | "warn" }): void {
  const symbols = {
    pass: "✔",
    warn: "⚠",
    fail: "✖"
  };

  const prefix = symbols[status] ?? "•";
  console.log(`${prefix} ${label}${details ? ` — ${details}` : ""}`);
}

async function checkCommandAvailability(execFileAsync: ExecFileAsync, command: string, args = ["--version"]): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 10_000 });
    const output = stdout?.trim() || stderr?.trim() || "";
    return {
      status: "pass",
      details: output.length > 0 ? output : "available"
    };
  }
  catch (error) {
    return {
      status: "fail",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildListCommandHandler({ defaultGraphPath, projectRoot }: Pick<OrchestratorContext, "defaultGraphPath" | "projectRoot">) {
  return async function listCommand(options: { graph?: string; pipelines?: boolean; stages?: boolean }): Promise<void> {
    const graphPath = path.resolve(options.graph ?? defaultGraphPath);
    const { graph, stageMap } = await loadGraphMetadata(graphPath);
    const pipelinesOnly = Boolean(options.pipelines);
    const stagesOnly = Boolean(options.stages);
    const showPipelines = pipelinesOnly || !stagesOnly;
    const showStages = stagesOnly || !pipelinesOnly;

    console.log(`Stage graph: ${path.relative(projectRoot, graphPath)}\n`);

    if (showPipelines) {
      printPipelineSummaries(graph.pipelines, stageMap);
    }

    if (showStages) {
      printStageSummaries(stageMap, graph.pipelines);
    }
  };
}

function buildDescribeCommandHandler({ defaultGraphPath }: Pick<OrchestratorContext, "defaultGraphPath">) {
  return async function describeCommand(identifier: string, options: { graph?: string }): Promise<void> {
    const graphPath = path.resolve(options.graph ?? defaultGraphPath);
    const { graph, stageMap, artifactMap, pipelineMap } = await loadGraphMetadata(graphPath);

    if (!identifier) {
      throw new Error("Please provide a pipeline or stage id to describe.");
    }

    if (pipelineMap.has(identifier)) {
      describePipeline(pipelineMap.get(identifier)!, stageMap);
      return;
    }

    if (stageMap.has(identifier)) {
      describeStage(stageMap.get(identifier)!, artifactMap, graph.pipelines);
      return;
    }

    const availablePipelines = Array.from(pipelineMap.keys()).join(", ");
    const stageSample = Array.from(stageMap.keys())
      .slice(0, 10)
      .join(", ");
    const stageSuffix = stageMap.size > 10 ? ", ..." : "";

    throw new Error(`Unknown identifier "${identifier}". Pipelines: ${availablePipelines}. Sample stages: ${stageSample}${stageSuffix}`);
  };
}

function buildDoctorCommandHandler({ minNodeVersion, execFileAsync }: Pick<OrchestratorContext, "execFileAsync" | "minNodeVersion">) {
  return async function doctorCommand() {
    console.log("Running environment diagnostics...\n");

    const nodeResult = checkNodeVersion(minNodeVersion);
    printCheckResult({
      label: `Node.js >= ${formatMinimumNodeVersion(minNodeVersion)}`,
      status: nodeResult.status,
      details: nodeResult.details
    });

    const gitResult = await checkCommandAvailability(execFileAsync, "git", ["--version"]);
    printCheckResult({
      label: "git available",
      status: gitResult.status,
      details: gitResult.details
    });

    const hasFailure = [nodeResult, gitResult].some(result => result.status === "fail");

    if (hasFailure) {
      console.log("\nOne or more checks failed. Please address the issues above.");
      process.exitCode = 1;
    }
    else {
      console.log("\nAll required tooling is available.");
    }
  };
}

function buildLogsCommandHandler({ runsDirectory }: Pick<OrchestratorContext, "runsDirectory">) {
  return async function logsCommand(runFile: string | undefined, options: { latest?: boolean } = {}): Promise<void> {
    const records = await listRunRecordFiles(runsDirectory);

    if (records.length === 0) {
      console.log("No pipeline run records found. Execute `pipeline run` to generate one.");
      return;
    }

    let targetRecord: RunRecordFileInfo | null = null;

    if (options.latest) {
      [targetRecord] = records;
    }
    else if (runFile) {
      const normalized = path.basename(runFile);
      targetRecord = records.find(record => record.name === normalized) ?? null;

      if (!targetRecord) {
        const index = Number.parseInt(runFile, 10);
        const isValidIndex = !Number.isNaN(index) && index > 0 && index <= records.length;
        if (isValidIndex) {
          targetRecord = records[index - 1];
        }
      }

      if (!targetRecord) {
        throw new Error(`Unable to locate run record matching "${runFile}".`);
      }
    }

    if (!targetRecord) {
      console.log("Available run records (newest first):");
      records.slice(0, 10).forEach((record, index) => {
        const timestamp = new Date(record.mtimeMs).toISOString();
        console.log(`  [${index + 1}] ${record.name} — ${timestamp}`);
      });

      if (records.length > 10) {
        console.log(`  ... and ${records.length - 10} more`);
      }

      console.log("\nPass a filename, numeric index, or use --latest to view details.");
      return;
    }

    const record = await readRunRecord(targetRecord.path);
    printRunRecordDetails(record, targetRecord.path);
  };
}

function buildBenchmarkCommandHandler({ runsDirectory }: Pick<OrchestratorContext, "runsDirectory">) {
  return async function benchmarkCommand(options: {
    includeFailed?: boolean;
    includeFiltered?: boolean;
    json?: boolean;
    limit?: string;
    pipeline?: string;
  } = {}): Promise<void> {
    const limit = parsePositiveInteger(options.limit, 20);
    const pipelineId = options.pipeline ?? "full-refresh-parallel";
    const includeFailed = Boolean(options.includeFailed);
    const includeFiltered = Boolean(options.includeFiltered);
    const { loadedRecords, runRecordFiles } = await loadRunRecords(runsDirectory);

    if (runRecordFiles.length === 0) {
      console.log("No pipeline run records found. Execute `pipeline run` to generate benchmark data.");
      return;
    }

    const selectedRecords = selectBenchmarkRecords(loadedRecords, {
      includeFailed,
      includeFiltered,
      limit,
      pipelineId
    });

    if (selectedRecords.length === 0) {
      console.log("No matching run records found for the current benchmark filters.");
      return;
    }

    const summary = buildBenchmarkSummary(selectedRecords);

    if (options.json) {
      console.log(JSON.stringify({
        includeFailed,
        includeFiltered,
        limit,
        pipelineId,
        summary
      }, null, 2));
      return;
    }

    printBenchmarkSummary(summary, {
      includeFailed,
      includeFiltered,
      pipelineId
    });
  };
}

function buildProgressCommandHandler({ runsDirectory }: Pick<OrchestratorContext, "runsDirectory">) {
  return async function progressCommand(options: {
    includeFiltered?: boolean;
    json?: boolean;
    limit?: string;
    pipeline?: string;
  } = {}): Promise<void> {
    const limit = parsePositiveInteger(options.limit, 20);
    const pipelineId = options.pipeline ?? "full-refresh-parallel";
    const includeFiltered = Boolean(options.includeFiltered);
    const { loadedRecords, runRecordFiles } = await loadRunRecords(runsDirectory);

    if (runRecordFiles.length === 0) {
      console.log("No pipeline run records found. Execute `pipeline run` to generate progress data.");
      return;
    }

    const selectedRecords = selectProgressRecords(loadedRecords, {
      includeFiltered,
      limit,
      pipelineId
    });

    if (selectedRecords.length === 0) {
      console.log("No matching run records found for the current progress filters.");
      return;
    }

    const summary = buildProgressSummary(selectedRecords);

    if (options.json) {
      console.log(JSON.stringify({
        includeFiltered,
        limit,
        pipelineId,
        summary
      }, null, 2));
      return;
    }

    printProgressSummary(summary, {
      includeFiltered,
      pipelineId
    });
  };
}

function buildDashboardCommandHandler({ runsDirectory }: Pick<OrchestratorContext, "runsDirectory">) {
  return async function dashboardCommand(options: {
    includeFiltered?: boolean;
    json?: boolean;
    limit?: string;
    pipeline?: string;
  } = {}): Promise<void> {
    const limit = parsePositiveInteger(options.limit, 20);
    const pipelineId = options.pipeline ?? "full-refresh-parallel";
    const includeFiltered = Boolean(options.includeFiltered);
    const { loadedRecords, runRecordFiles } = await loadRunRecords(runsDirectory);

    if (runRecordFiles.length === 0) {
      console.log("No pipeline run records found. Execute `pipeline run` to generate dashboard data.");
      return;
    }

    const selectedRecords = selectDashboardRecords(loadedRecords, {
      includeFiltered,
      limit,
      pipelineId
    });

    if (selectedRecords.length === 0) {
      console.log("No matching run records found for the current dashboard filters.");
      return;
    }

    const summary = buildDashboardSummary(selectedRecords);

    if (options.json) {
      console.log(JSON.stringify({
        includeFiltered,
        limit,
        pipelineId,
        summary
      }, null, 2));
      return;
    }

    printDashboardSummary(summary, {
      includeFiltered,
      pipelineId
    });
  };
}

export function registerAdditionalCommands(program: Command, context: OrchestratorContext): void {
  const benchmarkHandler = buildBenchmarkCommandHandler(context);
  const dashboardHandler = buildDashboardCommandHandler(context);
  const progressHandler = buildProgressCommandHandler(context);
  const listHandler = buildListCommandHandler(context);
  const describeHandler = buildDescribeCommandHandler(context);
  const doctorHandler = buildDoctorCommandHandler(context);
  const logsHandler = buildLogsCommandHandler(context);
  const defaultGraphPath = context.defaultGraphPath;

  program
    .command("list")
    .description("List pipelines or stages defined in the stage graph")
    .option("-g, --graph <path>", "Path to the stage graph", defaultGraphPath)
    .option("--pipelines", "Show only pipelines")
    .option("--stages", "Show only stages")
    .action(async (options) => {
      try {
        await listHandler(options ?? {});
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error listing graph entries: ${message}`);
        process.exitCode = 1;
      }
    });

  program
    .command("describe <identifier>")
    .description("Describe a pipeline or stage from the graph")
    .option("-g, --graph <path>", "Path to the stage graph", defaultGraphPath)
    .action(async (identifier, options) => {
      try {
        await describeHandler(identifier, options ?? {});
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error describing "${identifier}": ${message}`);
        process.exitCode = 1;
      }
    });

  program
    .command("doctor")
    .description("Run environment diagnostics for the pipeline")
    .action(async () => {
      try {
        await doctorHandler();
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Doctor command failed: ${message}`);
        process.exitCode = 1;
      }
    });

  program
    .command("logs [runFile]")
    .description("Inspect saved pipeline run metadata")
    .option("--latest", "Show the most recent run record")
    .action(async (runFile, options) => {
      try {
        await logsHandler(runFile, options ?? {});
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error reading run records: ${message}`);
        process.exitCode = 1;
      }
    });

  program
    .command("benchmark")
    .description("Summarize persisted pipeline run durations for benchmarking")
    .option("--pipeline <pipelineId>", "Pipeline id to benchmark", "full-refresh-parallel")
    .option("--limit <count>", "Maximum matching run records to include", "20")
    .option("--include-failed", "Include failed runs in benchmark samples")
    .option("--include-filtered", "Include runs executed with --only/--skip filters")
    .option("--json", "Print machine-readable benchmark summary")
    .action(async (options) => {
      try {
        await benchmarkHandler(options ?? {});
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error running benchmark summary: ${message}`);
        process.exitCode = 1;
      }
    });

  program
    .command("progress")
    .description("Summarize run outcomes and stage reliability for progress tracking")
    .option("--pipeline <pipelineId>", "Pipeline id to inspect", "full-refresh-parallel")
    .option("--limit <count>", "Maximum matching run records to include", "20")
    .option("--include-filtered", "Include runs executed with --only/--skip filters")
    .option("--json", "Print machine-readable progress summary")
    .action(async (options) => {
      try {
        await progressHandler(options ?? {});
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error running progress summary: ${message}`);
        process.exitCode = 1;
      }
    });

  program
    .command("dashboard")
    .description("Show a compact performance and reliability dashboard from persisted run records")
    .option("--pipeline <pipelineId>", "Pipeline id to inspect", "full-refresh-parallel")
    .option("--limit <count>", "Maximum matching run records to include", "20")
    .option("--include-filtered", "Include runs executed with --only/--skip filters")
    .option("--json", "Print machine-readable dashboard summary")
    .action(async (options) => {
      try {
        await dashboardHandler(options ?? {});
      }
      catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error running dashboard summary: ${message}`);
        process.exitCode = 1;
      }
    });
}
