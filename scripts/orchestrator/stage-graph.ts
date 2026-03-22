import path from "node:path";
import { readFile } from "node:fs/promises";

export interface PipelineDefinition {
  id: string;
  description?: string;
  stages: string[];
}

export interface ArtifactDefinition {
  id: string;
  type?: string;
  path: string;
  format?: string;
  description?: string;
  schema?: string;
}

export interface StageCommand {
  executable: string;
  args?: string[];
}

export interface StageExternalInput {
  type: "external";
  kind?: string;
  uri?: string;
  description?: string;
  optional?: boolean;
}

export interface StageArtifactInput {
  artifact: string;
  mode?: string;
  optional?: boolean;
  description?: string;
}

export type StageInput = StageArtifactInput | StageExternalInput;

export interface StageOutput {
  artifact?: string;
  mode?: string;
  optional?: boolean;
}

export interface ResolvedStageOutput extends Omit<StageOutput, "artifact"> {
  artifact: ArtifactDefinition;
}

export interface StageEnvironmentVariable {
  name: string;
  required?: boolean;
  description?: string;
}

export interface StageSideEffect {
  type?: string;
  description?: string;
}

export interface StageDefinition {
  id: string;
  name?: string;
  description?: string;
  command: StageCommand;
  dependsOn?: string[];
  inputs?: StageInput[];
  outputs?: StageOutput[];
  sideEffects?: StageSideEffect[];
  environment?: StageEnvironmentVariable[];
}

export interface ResolvedStageDefinition extends Omit<StageDefinition, "outputs"> {
  outputs?: StageOutput[];
  resolvedOutputs: ResolvedStageOutput[];
}

export interface StageGraph {
  version?: string;
  pipelines: PipelineDefinition[];
  artifacts?: ArtifactDefinition[];
  stages: StageDefinition[];
}

export async function loadStageGraph(graphPath: string): Promise<StageGraph> {
  const absolutePath = path.resolve(graphPath);
  const contents = await readFile(absolutePath, "utf8");
  const graph = JSON.parse(contents) as StageGraph;

  if (!Array.isArray(graph.pipelines) || graph.pipelines.length === 0) {
    throw new Error("Stage graph must define at least one pipeline.");
  }

  if (!Array.isArray(graph.stages) || graph.stages.length === 0) {
    throw new Error("Stage graph must define at least one stage.");
  }

  return graph;
}

export function buildArtifactMap(graph: StageGraph): Map<string, ArtifactDefinition> {
  const artifacts = graph.artifacts ?? [];
  const artifactMap = new Map<string, ArtifactDefinition>();

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

export function getPipeline(graph: StageGraph, pipelineId: string): PipelineDefinition {
  const pipeline = graph.pipelines.find(entry => entry.id === pipelineId);
  if (!pipeline) {
    const available = graph.pipelines.map(entry => entry.id).join(", ");
    throw new Error(`Unknown pipeline "${pipelineId}". Available pipelines: ${available}`);
  }

  if (!Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
    throw new Error(`Pipeline "${pipelineId}" does not define any stages.`);
  }

  return pipeline;
}

export function buildStageMap(graph: StageGraph): Map<string, StageDefinition> {
  const stageMap = new Map<string, StageDefinition>();
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

export function buildExecutionPlan(
  graph: StageGraph,
  pipelineId: string
): {
  pipeline: PipelineDefinition;
  stages: ResolvedStageDefinition[];
  artifactMap: Map<string, ArtifactDefinition>;
} {
  const pipeline = getPipeline(graph, pipelineId);
  const artifactMap = buildArtifactMap(graph);
  const stageMap = buildStageMap(graph);

  const stages = pipeline.stages.map((stageId): ResolvedStageDefinition => {
    const stage = stageMap.get(stageId);
    if (!stage) {
      throw new Error(`Pipeline "${pipelineId}" references unknown stage "${stageId}".`);
    }

    const resolvedOutputs = (stage.outputs ?? []).map((output): ResolvedStageOutput => {
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

  return { pipeline, stages, artifactMap };
}
