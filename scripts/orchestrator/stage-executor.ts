import process from "node:process";
import { spawn } from "node:child_process";
import type { StageCommand, StageDefinition } from "./stage-graph.ts";

export interface StageExecutionContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface StageExecutionResult<TStage extends StageDefinition = StageDefinition> {
  stage: TStage;
  durationMs: number;
}

export interface StageProgressDetails {
  stepNumber: number;
  total: number;
  message: string;
  durationMs?: number;
  formattedDuration?: string;
  error?: unknown;
}

export interface StageProgressLogger<TStage extends StageDefinition = StageDefinition> {
  fail?: (stage: TStage, details: StageProgressDetails) => void;
  start?: (stage: TStage, details: StageProgressDetails) => void;
  succeed?: (stage: TStage, details: StageProgressDetails) => void;
}

export type StageRunner<TStage extends StageDefinition = StageDefinition> = ((
  stage: TStage,
  options: StageExecutionContext
) => Promise<boolean>) & { reset?: () => void };

export type ValidateArtifacts<TStage extends StageDefinition = StageDefinition> = (
  stage: TStage,
  options: { cwd: string; logger?: StageProgressLogger<TStage> }
) => void | Promise<void>;

type StageExecutionError<TStage extends StageDefinition> = Error & {
  completedStages: StageExecutionResult<TStage>[];
  stage: TStage;
  stageIndex: number;
  stepNumber: number;
  totalStages: number;
};

interface ExecuteStageOptions<TStage extends StageDefinition> extends StageExecutionContext {
  stageRunner?: StageRunner<TStage>;
}

interface RunStagesOptions<TStage extends StageDefinition> extends StageExecutionContext {
  logger?: StageProgressLogger<TStage>;
  stageRunner?: StageRunner<TStage>;
  validateArtifacts?: ValidateArtifacts<TStage>;
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${durationMs}ms`;
}

function runStageProcess({ executable, args = [] }: StageCommand, options: StageExecutionContext): Promise<void> {
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

async function executeStage<TStage extends StageDefinition>(stage: TStage, options: ExecuteStageOptions<TStage>): Promise<void> {
  const handled = options.stageRunner
    ? await options.stageRunner(stage, { cwd: options.cwd, env: options.env })
    : false;

  if (!handled) {
    await runStageProcess(stage.command, options);
  }
}

export async function runStagesSequentially<TStage extends StageDefinition>(
  stages: TStage[],
  {
    logger,
    cwd = process.cwd(),
    env = process.env,
    stageRunner,
    validateArtifacts
  }: Partial<RunStagesOptions<TStage>> = {}
): Promise<Array<StageExecutionResult<TStage>>> {
  const results: Array<StageExecutionResult<TStage>> = [];

  try {
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      const stepNumber = index + 1;
      const total = stages.length;

      const message = `${stage.id}${stage.name ? ` (${stage.name})` : ""}`;
      logger?.start?.(stage, { stepNumber, total, message });

      const startedAt = Date.now();

      try {
        await executeStage(stage, { cwd, env, stageRunner });

        if (validateArtifacts) {
          await validateArtifacts(stage, { cwd, logger });
        }
      }
      catch (error) {
        logger?.fail?.(stage, { stepNumber, total, message, error });

        if (error instanceof Error) {
          const stageError = error as StageExecutionError<TStage>;
          stageError.stage = stage;
          stageError.stageIndex = index;
          stageError.stepNumber = stepNumber;
          stageError.totalStages = total;
          stageError.completedStages = results.slice();
        }

        throw error;
      }

      const durationMs = Date.now() - startedAt;
      const formattedDuration = formatDuration(durationMs);
      logger?.succeed?.(stage, { stepNumber, total, message, durationMs, formattedDuration });

      results.push({ stage, durationMs });
    }
  }
  finally {
    if (stageRunner && typeof stageRunner.reset === "function") {
      stageRunner.reset();
    }
  }

  return results;
}
