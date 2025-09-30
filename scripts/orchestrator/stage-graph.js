import path from "node:path";
import {readFile} from "node:fs/promises";

export async function loadStageGraph (graphPath) {
  const absolutePath = path.resolve(graphPath);
  const contents = await readFile(absolutePath, "utf8");
  const graph = JSON.parse(contents);

  if (!Array.isArray(graph.pipelines) || graph.pipelines.length === 0) {
    throw new Error("Stage graph must define at least one pipeline.");
  }

  if (!Array.isArray(graph.stages) || graph.stages.length === 0) {
    throw new Error("Stage graph must define at least one stage.");
  }

  return graph;
}

export function getPipeline (graph, pipelineId) {
  const pipeline = graph.pipelines.find((entry) => entry.id === pipelineId);
  if (!pipeline) {
    const available = graph.pipelines.map((entry) => entry.id).join(", ");
    throw new Error(`Unknown pipeline "${pipelineId}". Available pipelines: ${available}`);
  }

  if (!Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
    throw new Error(`Pipeline "${pipelineId}" does not define any stages.`);
  }

  return pipeline;
}

export function buildStageMap (graph) {
  const stageMap = new Map();
  for (const stage of graph.stages) {
    if (!stage.id) {
      throw new Error("Encountered a stage without an id in the graph.");
    }

    if (!stage.command || !stage.command.executable) {
      throw new Error(`Stage "${stage.id}" is missing a command executable.`);
    }

    stageMap.set(stage.id, stage);
  }

  return stageMap;
}

export function buildExecutionPlan (graph, pipelineId) {
  const pipeline = getPipeline(graph, pipelineId);
  const stageMap = buildStageMap(graph);

  const stages = pipeline.stages.map((stageId) => {
    const stage = stageMap.get(stageId);
    if (!stage) {
      throw new Error(`Pipeline "${pipelineId}" references unknown stage "${stageId}".`);
    }

    return stage;
  });

  return {pipeline, stages};
}
