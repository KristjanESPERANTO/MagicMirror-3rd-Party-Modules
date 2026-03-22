import process from "node:process";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";
export type LogFormat = "text" | "json";

export interface LogWriter {
  error?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
  [key: string]: unknown;
}

export interface CreateLoggerOptions {
  name?: string;
  level?: LogLevel | number;
  writer?: LogWriter;
  format?: LogFormat;
}

export interface Logger {
  readonly format: string;
  level: string;
  child(childName?: string): Logger;
  error(message: unknown, ...details: unknown[]): void;
  warn(message: unknown, ...details: unknown[]): void;
  info(message: unknown, ...details: unknown[]): void;
  debug(message: unknown, ...details: unknown[]): void;
  trace(message: unknown, ...details: unknown[]): void;
  log(message: unknown, ...details: unknown[]): void;
}

interface StageDetails {
  id: string;
  name?: string;
}

export interface StageProgressLogger {
  readonly format: string;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
  start(stage: StageDetails, step: { stepNumber: number; total: number }): void;
  succeed(
    stage: StageDetails,
     step: { stepNumber: number; total: number; formattedDuration?: string; durationMs?: number }
  ): void;
  fail(stage: StageDetails, step: { stepNumber: number; total: number; error?: unknown }): void;
}

const LOG_LEVEL_PRIORITIES = new Map<string, number>([
  ["silent", -1],
  ["error", 0],
  ["warn", 1],
  ["info", 2],
  ["debug", 3],
  ["trace", 4]
]);

const METHOD_BY_LEVEL = new Map<string, string>([
  ["error", "error"],
  ["warn", "warn"],
  ["info", "info"],
  ["debug", "debug"],
  ["trace", "debug"]
]);

const DEFAULT_LOG_LEVEL = (process.env.LOG_LEVEL ?? "info") as LogLevel;
const DEFAULT_LOG_FORMAT = (process.env.LOG_FORMAT ?? "text") as LogFormat;

function normalizeLogLevel(level: LogLevel | number | string = DEFAULT_LOG_LEVEL): number {
  if (typeof level === "number" && Number.isFinite(level)) {
    return level;
  }

  const normalized = String(level).toLowerCase();
  if (!LOG_LEVEL_PRIORITIES.has(normalized)) {
    throw new Error(`Unknown log level "${level}". Expected one of: ${[...LOG_LEVEL_PRIORITIES.keys()].join(", ")}`);
  }

  return LOG_LEVEL_PRIORITIES.get(normalized)!;
}

function levelNameFromPriority(priority: number): string {
  for (const [levelName, value] of LOG_LEVEL_PRIORITIES.entries()) {
    if (value === priority) {
      return levelName;
    }
  }

  return "info";
}

function safeJoinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

interface EmitterParams {
  writer: LogWriter;
  getLevelPriority: () => number;
  name?: string;
  format: string;
}

type EmitFn = (levelName: string, message: unknown, details: unknown[]) => void;

function createEmitter({ writer, getLevelPriority, name, format }: EmitterParams): EmitFn {
  const resolveWriter = (method: string): (...args: unknown[]) => void => {
    const resolved = method in writer ? writer[method] : writer.log;
    return typeof resolved === "function"
      ? (resolved as (...args: unknown[]) => void).bind(writer)
      : console.log;
  };

  const emit: EmitFn = (levelName, message, details) => {
    const priority = LOG_LEVEL_PRIORITIES.get(levelName) ?? LOG_LEVEL_PRIORITIES.get("info")!;
    if (priority > getLevelPriority()) {
      return;
    }

    const method = METHOD_BY_LEVEL.get(levelName) ?? "log";
    const output = resolveWriter(method);

    if (format === "json") {
      const logEntry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level: levelName,
        name,
        message
      };

      /*
       * If the first detail is an object, merge it into the log entry for cleaner JSON
       * Otherwise, put all details in a 'data' array
       */
      if (details.length > 0) {
        if (details.length === 1 && typeof details[0] === "object" && details[0] !== null) {
          Object.assign(logEntry, details[0]);
        }
        else {
          logEntry.data = details;
        }
      }

      output(JSON.stringify(logEntry));
      return;
    }

    const prefix = safeJoinParts([
      `[${formatTimestamp()}]`,
      `[${levelName.toUpperCase()}]`,
      name ? `[${name}]` : null
    ]);

    if (typeof message === "string" && details.length > 0) {
      output(`${prefix} ${message}`, ...details);
      return;
    }

    if (typeof message === "string") {
      output(`${prefix} ${message}`);
      return;
    }

    output(prefix, message, ...details);
  };

  return emit;
}

export function createLogger({
  name,
  level = DEFAULT_LOG_LEVEL,
  writer,
  format = DEFAULT_LOG_FORMAT
}: CreateLoggerOptions = {}): Logger {
  const effectiveWriter: LogWriter = writer ?? (console as unknown as LogWriter);
  let currentLevelPriority = normalizeLogLevel(level);

  const getLevelPriority = () => currentLevelPriority;
  const emitter = createEmitter({ writer: effectiveWriter, getLevelPriority, name, format });

  const logger: Logger = {
    get format() {
      return format;
    },
    get level() {
      return levelNameFromPriority(currentLevelPriority);
    },
    set level(newLevel: string) {
      currentLevelPriority = normalizeLogLevel(newLevel);
    },
    child(childName?: string): Logger {
      const suffix = childName ? `${childName}` : null;
      let combinedName = name;

      if (suffix && name) {
        combinedName = `${name}:${suffix}`;
      }
      else if (suffix) {
        combinedName = suffix;
      }

      return createLogger({
        name: combinedName,
        level: currentLevelPriority,
        writer: effectiveWriter,
        format
      });
    },
    error(message, ...details) {
      emitter("error", message, details);
    },
    warn(message, ...details) {
      emitter("warn", message, details);
    },
    info(message, ...details) {
      emitter("info", message, details);
    },
    debug(message, ...details) {
      emitter("debug", message, details);
    },
    trace(message, ...details) {
      emitter("trace", message, details);
    },
    log(message, ...details) {
      emitter("info", message, details);
    }
  };

  return logger;
}

function formatStageDetails(stage: StageDetails): string {
  if (!stage) {
    return "";
  }

  if (stage.name) {
    return `${stage.id} (${stage.name})`;
  }

  return stage.id;
}

export function createStageProgressLogger(baseLogger?: Logger): StageProgressLogger {
  const logger = baseLogger ?? createLogger({ name: "pipeline" });
  const isJson = logger.format === "json";

  return {
    get format() {
      return logger.format;
    },
    info(message, details) {
      logger.info(message, details);
    },
    warn(message, details) {
      logger.warn(message, details);
    },
    error(message, details) {
      logger.error(message, details);
    },
    start(stage, { stepNumber, total }) {
      const details = formatStageDetails(stage);
      const message = `▶︎  [${stepNumber}/${total}] ${details}`;
      if (isJson) {
        logger.info(message, {
          event: "stage_start",
          stageId: stage.id,
          stageName: stage.name,
          stepNumber,
          totalSteps: total
        });
      }
      else {
        logger.info(message);
      }
    },
    succeed(stage, { stepNumber, total, formattedDuration, durationMs }) {
      const details = formatStageDetails(stage);
      const message = `✔︎  [${stepNumber}/${total}] ${details} — completed in ${formattedDuration}`;
      if (isJson) {
        logger.info(message, {
          event: "stage_succeed",
          stageId: stage.id,
          stageName: stage.name,
          stepNumber,
          totalSteps: total,
          durationMs,
          formattedDuration
        });
      }
      else {
        logger.info(message);
      }
    },
    fail(stage, { stepNumber, total, error }) {
      const details = formatStageDetails(stage);
      const message = `✖︎  [${stepNumber}/${total}] ${details} — failed`;
      if (isJson) {
        logger.error(message, {
          event: "stage_fail",
          stageId: stage.id,
          stageName: stage.name,
          stepNumber,
          totalSteps: total,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null
        });
      }
      else {
        logger.error(message);
        if (error) {
          logger.error(error instanceof Error ? error.message : String(error));
        }
      }
    }
  };
}
