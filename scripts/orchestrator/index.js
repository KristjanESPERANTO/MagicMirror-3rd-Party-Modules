#!/usr/bin/env node

import {buildExecutionPlan, loadStageGraph} from "./stage-graph.js";
import {Command} from "commander";
import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";
import {runStagesSequentially} from "./stage-executor.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const PROJECT_ROOT = path.resolve(currentDir, "..", "..");
const DEFAULT_GRAPH_PATH = path.join(PROJECT_ROOT, "pipeline", "stage-graph.json");

function createLogger () {
  return {
    start (stage, {stepNumber, total}) {
      const details = stage.name ? `${stage.id} (${stage.name})` : stage.id;
      console.log(`\n▶︎  [${stepNumber}/${total}] ${details}`);
    },
    succeed (stage, {stepNumber, total, formattedDuration}) {
      const details = stage.name ? `${stage.id} (${stage.name})` : stage.id;
      console.log(`✔︎  [${stepNumber}/${total}] ${details} — completed in ${formattedDuration}`);
    },
    fail (stage, {stepNumber, total, error}) {
      const details = stage.name ? `${stage.id} (${stage.name})` : stage.id;
      console.error(`✖︎  [${stepNumber}/${total}] ${details} — failed`);
      if (error) {
        console.error(error.message);
      }
    }
  };
}

async function runPipeline (pipelineId, {graphPath}) {
  const logger = createLogger();
  const graph = await loadStageGraph(graphPath);
  const {pipeline, stages} = buildExecutionPlan(graph, pipelineId);

  console.log(`Running pipeline "${pipeline.id}" using graph ${path.relative(PROJECT_ROOT, graphPath)}\n`);

  await runStagesSequentially(stages, {
    cwd: PROJECT_ROOT,
    env: process.env,
    logger
  });

  console.log(`\nPipeline "${pipeline.id}" completed successfully.`);
}

export async function main (argv = process.argv) {
  const program = new Command();

  program
    .name("pipeline")
    .description("MagicMirror pipeline orchestrator");

  program
    .command("run [pipelineId]")
    .description("Execute the stages defined for the given pipeline")
    .option("-g, --graph <path>", "Path to the stage graph", DEFAULT_GRAPH_PATH)
    .action(async (pipelineId, options) => {
      const graphPath = path.resolve(options.graph);
      const selectedPipeline = pipelineId ?? "full-refresh";

      try {
        await runPipeline(selectedPipeline, {graphPath});
      } catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`\nPipeline execution failed: ${message}`);
        process.exitCode = 1;
      }
    });

  await program.parseAsync(argv);
}

if (import.meta.url === `file://${currentFile}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
