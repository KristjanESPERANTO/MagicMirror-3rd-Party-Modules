import {
  describePipeline,
  describeStage,
  listRunRecordFiles,
  loadGraphMetadata,
  printPipelineSummaries,
  printRunRecordDetails,
  printStageSummaries,
  readRunRecord
} from "./cli-helpers.js";
import path from "node:path";
import process from "node:process";

function checkNodeVersion (minimumMajor) {
  const raw = process.versions.node;
  const major = Number.parseInt(raw.split(".")[0], 10);

  if (Number.isNaN(major)) {
    return {
      status: "warn",
      details: `Unable to parse Node.js version (${raw}).`
    };
  }

  if (major < minimumMajor) {
    return {
      status: "fail",
      details: `Detected Node.js ${raw}. Requires >= ${minimumMajor}.`
    };
  }

  return {
    status: "pass",
    details: raw
  };
}

function printCheckResult ({label, status, details}) {
  const symbols = {
    pass: "✔",
    warn: "⚠",
    fail: "✖"
  };

  const prefix = symbols[status] ?? "•";
  console.log(`${prefix} ${label}${details ? ` — ${details}` : ""}`);
}

async function checkCommandAvailability (execFileAsync, command, args = ["--version"]) {
  try {
    const {stdout, stderr} = await execFileAsync(command, args, {timeout: 10_000});
    const output = stdout?.trim() || stderr?.trim() || "";
    return {
      status: "pass",
      details: output.length > 0 ? output : "available"
    };
  } catch (error) {
    return {
      status: "fail",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildListCommandHandler ({defaultGraphPath, projectRoot}) {
  return async function listCommand (options) {
    const graphPath = path.resolve(options.graph ?? defaultGraphPath);
    const {graph, stageMap} = await loadGraphMetadata(graphPath);
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

function buildDescribeCommandHandler ({defaultGraphPath}) {
  return async function describeCommand (identifier, options) {
    const graphPath = path.resolve(options.graph ?? defaultGraphPath);
    const {graph, stageMap, artifactMap, pipelineMap} = await loadGraphMetadata(graphPath);

    if (!identifier) {
      throw new Error("Please provide a pipeline or stage id to describe.");
    }

    if (pipelineMap.has(identifier)) {
      describePipeline(pipelineMap.get(identifier), stageMap);
      return;
    }

    if (stageMap.has(identifier)) {
      describeStage(stageMap.get(identifier), artifactMap, graph.pipelines);
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

function buildDoctorCommandHandler ({minNodeMajorVersion, execFileAsync}) {
  return async function doctorCommand () {
    console.log("Running environment diagnostics...\n");

    const nodeResult = checkNodeVersion(minNodeMajorVersion);
    printCheckResult({
      label: `Node.js >= ${minNodeMajorVersion}`,
      status: nodeResult.status,
      details: nodeResult.details
    });

    const gitResult = await checkCommandAvailability(execFileAsync, "git", ["--version"]);
    printCheckResult({
      label: "git available",
      status: gitResult.status,
      details: gitResult.details
    });

    const hasFailure = [nodeResult, gitResult].some((result) => result.status === "fail");

    if (hasFailure) {
      console.log("\nOne or more checks failed. Please address the issues above.");
      process.exitCode = 1;
    } else {
      console.log("\nAll required tooling is available.");
    }
  };
}

function buildLogsCommandHandler ({runsDirectory}) {
  return async function logsCommand (runFile, options = {}) {
    const records = await listRunRecordFiles(runsDirectory);

    if (records.length === 0) {
      console.log("No pipeline run records found. Execute `pipeline run` to generate one.");
      return;
    }

    let targetRecord = null;

    if (options.latest) {
      [targetRecord] = records;
    } else if (runFile) {
      const normalized = path.basename(runFile);
      targetRecord = records.find((record) => record.name === normalized) ?? null;

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

export function registerAdditionalCommands (program, context) {
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
      } catch (error) {
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
      } catch (error) {
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
      } catch (error) {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error reading run records: ${message}`);
        process.exitCode = 1;
      }
    });
}
