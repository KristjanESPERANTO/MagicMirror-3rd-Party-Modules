import process from "node:process";

const LOG_LEVEL_PRIORITIES = new Map([
  ["silent", -1],
  ["error", 0],
  ["warn", 1],
  ["info", 2],
  ["debug", 3],
  ["trace", 4]
]);

const METHOD_BY_LEVEL = new Map([
  ["error", "error"],
  ["warn", "warn"],
  ["info", "info"],
  ["debug", "debug"],
  ["trace", "debug"]
]);

const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

function normalizeLogLevel (level = DEFAULT_LOG_LEVEL) {
  if (typeof level === "number" && Number.isFinite(level)) {
    return level;
  }

  const normalized = String(level).toLowerCase();
  if (!LOG_LEVEL_PRIORITIES.has(normalized)) {
    throw new Error(`Unknown log level "${level}". Expected one of: ${[...LOG_LEVEL_PRIORITIES.keys()].join(", ")}`);
  }

  return LOG_LEVEL_PRIORITIES.get(normalized);
}

function levelNameFromPriority (priority) {
  for (const [levelName, value] of LOG_LEVEL_PRIORITIES.entries()) {
    if (value === priority) {
      return levelName;
    }
  }

  return "info";
}

function safeJoinParts (parts) {
  return parts.filter(Boolean).join(" ");
}

function formatTimestamp (date = new Date()) {
  return date.toISOString();
}

function createEmitter ({writer, getLevelPriority, name}) {
  const resolveWriter = (method) => {
    const resolved = method in writer ? writer[method] : writer.log;
    return typeof resolved === "function" ? resolved.bind(writer) : console.log;
  };

  const emit = (levelName, message, details) => {
    const priority = LOG_LEVEL_PRIORITIES.get(levelName) ?? LOG_LEVEL_PRIORITIES.get("info");
    if (priority > getLevelPriority()) {
      return;
    }

    const method = METHOD_BY_LEVEL.get(levelName) ?? "log";
    const output = resolveWriter(method);
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

export function createLogger ({name, level = DEFAULT_LOG_LEVEL, writer = console} = {}) {
  let currentLevelPriority = normalizeLogLevel(level);

  const getLevelPriority = () => currentLevelPriority;
  const emitter = createEmitter({writer, getLevelPriority, name});

  const logger = {
    get level () {
      return levelNameFromPriority(currentLevelPriority);
    },
    set level (newLevel) {
      currentLevelPriority = normalizeLogLevel(newLevel);
    },
    child (childName) {
      const suffix = childName ? `${childName}` : null;
      let combinedName = name;

      if (suffix && name) {
        combinedName = `${name}:${suffix}`;
      } else if (suffix) {
        combinedName = suffix;
      }

      return createLogger({
        name: combinedName,
        level: currentLevelPriority,
        writer
      });
    },
    error (message, ...details) {
      emitter("error", message, details);
    },
    warn (message, ...details) {
      emitter("warn", message, details);
    },
    info (message, ...details) {
      emitter("info", message, details);
    },
    debug (message, ...details) {
      emitter("debug", message, details);
    },
    trace (message, ...details) {
      emitter("trace", message, details);
    },
    log (message, ...details) {
      emitter("info", message, details);
    }
  };

  return logger;
}

function formatStageDetails (stage) {
  if (!stage) {
    return "";
  }

  if (stage.name) {
    return `${stage.id} (${stage.name})`;
  }

  return stage.id;
}

export function createStageProgressLogger (baseLogger) {
  const logger = baseLogger ?? createLogger({name: "pipeline"});

  return {
    start (stage, {stepNumber, total}) {
      const details = formatStageDetails(stage);
      logger.info(`▶︎  [${stepNumber}/${total}] ${details}`);
    },
    succeed (stage, {stepNumber, total, formattedDuration}) {
      const details = formatStageDetails(stage);
      logger.info(`✔︎  [${stepNumber}/${total}] ${details} — completed in ${formattedDuration}`);
    },
    fail (stage, {stepNumber, total, error}) {
      const details = formatStageDetails(stage);
      logger.error(`✖︎  [${stepNumber}/${total}] ${details} — failed`);
      if (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      }
    }
  };
}
