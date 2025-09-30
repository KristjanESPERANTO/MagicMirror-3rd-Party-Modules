import {buildArtifactMap, buildStageMap, loadStageGraph} from "./stage-graph.js";
import {readFile, readdir, stat} from "node:fs/promises";
import path from "node:path";

export async function loadGraphMetadata (graphPath) {
  const graph = await loadStageGraph(graphPath);
  const stageMap = buildStageMap(graph);
  const artifactMap = buildArtifactMap(graph);
  const pipelineMap = new Map(graph.pipelines.map((pipeline) => [pipeline.id, pipeline]));

  return {
    graph,
    stageMap,
    artifactMap,
    pipelineMap
  };
}

export function formatDuration (milliseconds) {
  if (typeof milliseconds !== "number" || Number.isNaN(milliseconds)) {
    return "unknown";
  }

  const seconds = milliseconds / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;

  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

export function formatFiltersSummary (filters) {
  if (!filters) {
    return "(none)";
  }

  const parts = [];

  if (filters.only?.length) {
    parts.push(`only=[${filters.only.join(", ")}]`);
  }

  if (filters.skip?.length) {
    parts.push(`skip=[${filters.skip.join(", ")}]`);
  }

  return parts.length > 0 ? parts.join(" ") : "(none)";
}

export async function listRunRecordFiles (runsDirectory) {
  try {
    const entries = await readdir(runsDirectory, {withFileTypes: true});
    const files = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const filePath = path.join(runsDirectory, entry.name);
        const stats = await stat(filePath);

        files.push({
          name: entry.name,
          path: filePath,
          mtimeMs: stats.mtimeMs
        });
      }
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function readRunRecord (filePath) {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents);
}

function buildStageUsageMap (pipelines) {
  const usage = new Map();

  for (const pipeline of pipelines) {
    for (const stageId of pipeline.stages) {
      if (!usage.has(stageId)) {
        usage.set(stageId, []);
      }

      usage.get(stageId).push(pipeline.id);
    }
  }

  return usage;
}

export function printPipelineSummaries (pipelines, stageMap) {
  console.log("Available pipelines:\n");

  for (const pipeline of pipelines) {
    const stageCount = pipeline.stages.length;
    const label = stageCount === 1 ? "stage" : "stages";
    console.log(`• ${pipeline.id} — ${stageCount} ${label}`);

    if (pipeline.description) {
      console.log(`    ${pipeline.description}`);
    }

    const stageSummaries = pipeline.stages.map((stageId) => {
      const stage = stageMap.get(stageId);
      return stage?.name ? `${stage.id} (${stage.name})` : stageId;
    });

    console.log(`    ${stageSummaries.join(" → ")}`);
    console.log("");
  }
}

export function printStageSummaries (stageMap, pipelines) {
  const usageMap = buildStageUsageMap(pipelines);
  const stages = [...stageMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  console.log("Available stages:\n");

  for (const stage of stages) {
    const header = stage.name ? `${stage.id} — ${stage.name}` : stage.id;
    console.log(`• ${header}`);

    if (stage.description) {
      console.log(`    ${stage.description}`);
    }

    const usedIn = usageMap.get(stage.id) ?? [];
    if (usedIn.length > 0) {
      console.log(`    Pipelines: ${usedIn.join(", ")}`);
    }

    console.log("");
  }
}

export function describePipeline (pipeline, stageMap) {
  console.log(`Pipeline: ${pipeline.id}`);
  if (pipeline.description) {
    console.log(pipeline.description);
  }

  console.log("\nStages:");
  pipeline.stages.forEach((stageId, index) => {
    const stage = stageMap.get(stageId);
    const position = `${index + 1}.`;
    const label = stage?.name ? `${stage.id} (${stage.name})` : stageId;
    console.log(`  ${position.padStart(3, " ")} ${label}`);
  });
}

export function describeStage (stage, artifactMap, pipelines) {
  const heading = stage.name ? `${stage.id} — ${stage.name}` : stage.id;
  console.log(`Stage: ${heading}`);

  if (stage.description) {
    console.log(stage.description);
  }

  if (stage.command) {
    const args = stage.command.args?.length ? ` ${stage.command.args.join(" ")}` : "";
    console.log(`\nCommand: ${stage.command.executable}${args}`);
  }

  const dependsOn = stage.dependsOn ?? [];
  if (dependsOn.length > 0) {
    console.log(`Depends on: ${dependsOn.join(", ")}`);
  }

  if (stage.inputs?.length) {
    console.log("\nInputs:");
    for (const input of stage.inputs) {
      if (input.artifact) {
        const artifact = artifactMap.get(input.artifact);
        const mode = input.mode ?? "read";
        const optional = input.optional ? " (optional)" : "";
        const pathHint = artifact?.path ? ` — ${artifact.path}` : "";
        console.log(`  • [${mode}] ${input.artifact}${pathHint}${optional}`);
      } else if (input.type === "external") {
        const optional = input.optional ? " (optional)" : "";
        console.log(`  • [external ${input.kind ?? "unknown"}] ${input.uri ?? ""}${optional}`);
      }
    }
  }

  if (stage.outputs?.length) {
    console.log("\nOutputs:");
    for (const output of stage.outputs) {
      const artifact = output.artifact ? artifactMap.get(output.artifact) : null;
      const mode = output.mode ?? "write";
      const pathHint = artifact?.path ? ` — ${artifact.path}` : "";
      console.log(`  • [${mode}] ${output.artifact ?? "(unspecified)"}${pathHint}`);
    }
  }

  if (stage.environment?.length) {
    console.log("\nEnvironment variables:");
    for (const envVar of stage.environment) {
      const required = envVar.required ? "required" : "optional";
      console.log(`  • ${envVar.name} (${required})${envVar.description ? ` — ${envVar.description}` : ""}`);
    }
  }

  if (stage.sideEffects?.length) {
    console.log("\nSide effects:");
    for (const sideEffect of stage.sideEffects) {
      console.log(`  • ${sideEffect.type ?? "unknown"}${sideEffect.description ? ` — ${sideEffect.description}` : ""}`);
    }
  }

  const pipelinesIncludingStage = pipelines
    .filter((pipeline) => pipeline.stages.includes(stage.id))
    .map((pipeline) => pipeline.id);

  if (pipelinesIncludingStage.length > 0) {
    console.log(`\nUsed in pipelines: ${pipelinesIncludingStage.join(", ")}`);
  }
}

export function printRunRecordDetails (record, sourcePath) {
  console.log(`Run file: ${path.basename(sourcePath)}`);
  console.log(`Pipeline: ${record.pipelineId}`);
  console.log(`Status: ${record.status}`);
  console.log(`Graph: ${record.graphPath}`);
  console.log(`Started: ${record.startedAt}`);
  console.log(`Finished: ${record.finishedAt}`);
  console.log(`Duration: ${formatDuration(record.durationMs)}`);
  console.log(`Filters: ${formatFiltersSummary(record.filters)}`);

  if (record.failure) {
    console.log(`Failure: ${record.failure.message}`);
    if (record.failure.stageId) {
      console.log(`  Stage: ${record.failure.stageId}${record.failure.stageName ? ` (${record.failure.stageName})` : ""}`);
    }
  }

  if (Array.isArray(record.stageResults) && record.stageResults.length > 0) {
    console.log("\nStage results:");
    for (const stageResult of record.stageResults) {
      let symbol = "•";
      if (stageResult.status === "succeeded") {
        symbol = "✔";
      } else if (stageResult.status === "failed") {
        symbol = "✖";
      }

      const label = stageResult.name ? `${stageResult.id} (${stageResult.name})` : stageResult.id ?? "(unknown)";
      const duration = typeof stageResult.durationMs === "number" ? ` — ${formatDuration(stageResult.durationMs)}` : "";
      console.log(`  ${symbol} ${label}${duration}`);

      if (stageResult.error) {
        console.log(`      ${stageResult.error}`);
      }
    }
  }
}
