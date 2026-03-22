import { createLogger } from "../shared/logger.js";
import process from "node:process";
import { resolve } from "node:path";
import { runAggregateCatalogue } from "../aggregate-catalogue.js";
import { runCollectMetadata } from "../collect-metadata/index.js";
import { runParallelProcessing } from "../parallel-processing.js";

export function createInProcessStageRunner({ projectRoot, stageRuntimes = {} } = {}) {
  const artifactStore = new Map();
  const aggregateCatalogue = stageRuntimes.aggregateCatalogue ?? runAggregateCatalogue;
  const collectMetadata = stageRuntimes.collectMetadata ?? runCollectMetadata;
  const parallelProcessing = stageRuntimes.parallelProcessing ?? runParallelProcessing;

  const runStageInProcess = async (stage, { cwd = process.cwd(), env = process.env } = {}) => {
    const runRoot = resolve(projectRoot ?? cwd);

    if (stage.id === "collect-metadata") {
      const result = await collectMetadata({
        outputPath: resolve(runRoot, "website/data/modules.stage.2.json")
      });
      artifactStore.set("modules-stage-2", result.modules);
      return true;
    }

    if (stage.id === "parallel-processing" && artifactStore.has("modules-stage-2")) {
      const runLogger = createLogger({
        name: "parallel-processing",
        format: env.LOG_FORMAT ?? process.env.LOG_FORMAT ?? "text"
      });

      const stage2Modules = artifactStore.get("modules-stage-2");
      let result;

      try {
        result = await parallelProcessing({
          modules: stage2Modules,
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

    if (stage.id === "aggregate-catalogue" && artifactStore.has("modules-stage-5")) {
      const stage5Modules = artifactStore.get("modules-stage-5");

      try {
        await aggregateCatalogue({
          projectRoot: runRoot,
          stage5Modules
        });
      }
      finally {
        // Stage 5 modules are no longer needed after aggregation.
        artifactStore.delete("modules-stage-5");
      }

      return true;
    }

    return false;
  };

  runStageInProcess.getBufferedArtifactIds = () => [...artifactStore.keys()];
  runStageInProcess.reset = () => {
    artifactStore.clear();
  };

  return runStageInProcess;
}
