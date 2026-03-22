import type { LogFormat } from "../shared/logger.ts";
import { createLogger } from "../shared/logger.ts";
import { runGenerateResultMarkdown } from "../generate-result-markdown.ts";
import process from "node:process";
import { resolve } from "node:path";
import { runAggregateCatalogue } from "../aggregate-catalogue.ts";
import { runCollectMetadata } from "../collect-metadata/index.ts";
import { runParallelProcessing } from "../parallel-processing.ts";
import type { ResolvedStageDefinition } from "./stage-graph.ts";
import type { StageExecutionContext } from "./stage-executor.ts";

interface StageRuntimeOverrides {
  aggregateCatalogue?: (options: Record<string, unknown>) => Promise<unknown>;
  collectMetadata?: (options: Record<string, unknown>) => Promise<{ modules: unknown[] }>;
  generateResultMarkdown?: (options: Record<string, unknown>) => Promise<unknown>;
  parallelProcessing?: (options: Record<string, unknown>) => Promise<{ stage5Modules: unknown[] }>;
}

interface CreateInProcessStageRunnerOptions {
  projectRoot?: string;
  stageRuntimes?: StageRuntimeOverrides;
}

export function createInProcessStageRunner({
  projectRoot,
  stageRuntimes = {}
}: CreateInProcessStageRunnerOptions = {}) {
  const artifactStore = new Map<string, unknown>();
  const aggregateCatalogue = stageRuntimes.aggregateCatalogue ?? runAggregateCatalogue;
  const collectMetadata = stageRuntimes.collectMetadata ?? runCollectMetadata;
  const generateResultMarkdown = stageRuntimes.generateResultMarkdown ?? runGenerateResultMarkdown;
  const parallelProcessing = stageRuntimes.parallelProcessing ?? runParallelProcessing;

  const runStageInProcess = async (
    stage: ResolvedStageDefinition,
    { cwd = process.cwd(), env = process.env }: Partial<StageExecutionContext> = {}
  ): Promise<boolean> => {
    const runRoot = resolve(projectRoot ?? cwd);

    if (stage.id === "collect-metadata") {
      const result = await collectMetadata({
        outputPath: resolve(runRoot, "website/data/modules.stage.2.json"),
        outputWriter: null as never
      });
      artifactStore.set("modules-stage-2", result.modules);
      return true;
    }

    if (stage.id === "parallel-processing" && artifactStore.has("modules-stage-2")) {
      const runLogger = createLogger({
        name: "parallel-processing",
        format: (env.LOG_FORMAT ?? process.env.LOG_FORMAT ?? "text") as LogFormat
      });

      const stage2Modules = artifactStore.get("modules-stage-2");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;

      try {
        result = await parallelProcessing({
          modules: stage2Modules as never,
          outputWriter: null as never,
          projectRoot: runRoot,
          runLogger
        });
      }
      finally {
        // Stage 2 modules are no longer needed once processing starts.
        artifactStore.delete("modules-stage-2");
      }

      artifactStore.set("modules-stage-5", result.stage5Modules);
      return true;
    }

    if (stage.id === "aggregate-catalogue") {
      const stage5Modules = artifactStore.get("modules-stage-5");
      const aggregateOptions: Record<string, unknown> = {
        projectRoot: runRoot
      };

      if (stage5Modules !== undefined) {
        aggregateOptions.stage5Modules = stage5Modules;
      }

      await aggregateCatalogue(aggregateOptions);

      return true;
    }

    if (stage.id === "generate-result-markdown") {
      const stage5Modules = artifactStore.get("modules-stage-5");
      const markdownOptions: Record<string, unknown> = {
        projectRoot: runRoot
      };

      if (stage5Modules !== undefined) {
        markdownOptions.stage5Modules = stage5Modules;
      }

      try {
        await generateResultMarkdown(markdownOptions);
      }
      finally {
        artifactStore.delete("modules-stage-5");
      }

      return true;
    }

    return false;
  };

  return Object.assign(runStageInProcess, {
    getBufferedArtifactIds: (): string[] => [...artifactStore.keys()],
    reset: (): void => {
      artifactStore.clear();
    }
  });
}
