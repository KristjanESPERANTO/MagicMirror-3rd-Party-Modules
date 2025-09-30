import process from "node:process";
import {spawn} from "node:child_process";

function formatDuration (durationMs) {
  const seconds = durationMs / 1000;
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${durationMs}ms`;
}

function runStageProcess ({executable, args = []}, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
      shell: false
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`Command failed with ${reason}`));
    });
  });
}

export async function runStagesSequentially (stages, {logger, cwd = process.cwd(), env = process.env, validateArtifacts} = {}) {
  const results = [];

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const stepNumber = index + 1;
    const total = stages.length;

    const message = `${stage.id}${stage.name ? ` (${stage.name})` : ""}`;
    logger?.start?.(stage, {stepNumber, total, message});

    const startedAt = Date.now();

    try {
      await runStageProcess(stage.command, {cwd, env});

      if (validateArtifacts) {
        await validateArtifacts(stage, {cwd});
      }
    } catch (error) {
      logger?.fail?.(stage, {stepNumber, total, message, error});

      if (error instanceof Error) {
        error.stage = stage;
        error.stageIndex = index;
        error.stepNumber = stepNumber;
        error.totalStages = total;
        error.completedStages = results.slice();
      }

      throw error;
    }

    const durationMs = Date.now() - startedAt;
    const formattedDuration = formatDuration(durationMs);
    logger?.succeed?.(stage, {stepNumber, total, message, durationMs, formattedDuration});

    results.push({stage, durationMs});
  }

  return results;
}
