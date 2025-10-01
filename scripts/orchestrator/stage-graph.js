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

export function buildArtifactMap (graph) {
  const artifacts = graph.artifacts ?? [];
  const artifactMap = new Map();

  for (const artifact of artifacts) {
    if (!artifact.id) {
      throw new Error("Encountered an artifact without an id in the graph.");
    }

    if (!artifact.path) {
      throw new Error(`Artifact "${artifact.id}" must define a path.`);
    }

    if (artifactMap.has(artifact.id)) {
      throw new Error(`Artifact id "${artifact.id}" is declared multiple times.`);
    }

    artifactMap.set(artifact.id, artifact);
  }

  return artifactMap;
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
  const artifactMap = buildArtifactMap(graph);
  const stageMap = buildStageMap(graph);

  const stages = pipeline.stages.map((stageId) => {
    const stage = stageMap.get(stageId);
    if (!stage) {
      throw new Error(`Pipeline "${pipelineId}" references unknown stage "${stageId}".`);
    }

    const resolvedOutputs = (stage.outputs ?? []).map((output) => {
      if (!output.artifact) {
        throw new Error(`Stage "${stage.id}" declares an output without an artifact id.`);
      }

      const artifact = artifactMap.get(output.artifact);
      if (!artifact) {
        throw new Error(`Stage "${stage.id}" references unknown artifact "${output.artifact}".`);
      }

      return {
        ...output,
        artifact
      };
    });

    return {
      ...stage,
      resolvedOutputs
    };
  });

  return {pipeline, stages, artifactMap};
}
