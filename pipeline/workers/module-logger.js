/**
 * Per-Module Logging Utility (P7.4)
 *
 * Provides structured logging for individual module processing.
 * Logs are written to files organized by run timestamp and module ID.
 */

import { ensureDirectory } from "../../scripts/shared/fs-utils.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * @typedef {Object} ModuleLoggerOptions
 * @property {string} projectRoot - Project root directory
 * @property {string} runId - Unique run identifier (timestamp)
 * @property {string} moduleId - Module identifier (name-----maintainer)
 * @property {number} [workerId] - Worker process ID
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO timestamp
 * @property {string} level - Log level (info, warn, error, debug)
 * @property {string} phase - Processing phase (clone, enrich, analyze)
 * @property {string} message - Log message
 * @property {Object} [data] - Additional structured data
 */

/**
 * Create a module-specific logger that writes to file
 *
 * @param {ModuleLoggerOptions} options
 * @returns {Promise<ModuleLogger>}
 */
export async function createModuleLogger(options) {
  const { projectRoot, runId, moduleId, workerId } = options;

  // Create logs directory structure: logs/{runId}/modules/
  const logsDir = path.join(projectRoot, "logs", runId, "modules");
  await ensureDirectory(logsDir);

  // Sanitize module ID for filename (replace special chars)
  const safeModuleId = moduleId.replace(/[^a-zA-Z0-9_-]/gu, "_");
  const logFileName = workerId
    ? `${safeModuleId}.worker-${workerId}.log`
    : `${safeModuleId}.log`;

  const logFilePath = path.join(logsDir, logFileName);

  // Log buffer (written periodically and on close)
  const logBuffer = [];
  let closed = false;

  /**
   * Write buffered logs to file
   */
  async function flush() {
    if (logBuffer.length === 0 || closed) {
      return;
    }

    const content = `${logBuffer.join("\n")}\n`;
    await fs.appendFile(logFilePath, content, "utf8");
    logBuffer.length = 0;
  }

  /**
   * Format log entry
   * @param {LogEntry} entry
   * @returns {string}
   */
  function formatLogEntry(entry) {
    const { timestamp, level, phase, message, data } = entry;
    const parts = [`[${timestamp}]`, `[${level.toUpperCase()}]`, `[${phase}]`, message];

    if (data && Object.keys(data).length > 0) {
      parts.push(JSON.stringify(data));
    }

    return parts.join(" ");
  }

  /**
   * Add log entry
   * @param {string} level
   * @param {string} phase
   * @param {string} message
   * @param {Object} [data]
   */
  async function log(level, phase, message, data) {
    if (closed) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
      ...(data && { data })
    };

    logBuffer.push(formatLogEntry(entry));

    // Auto-flush on error or if buffer is large
    if (level === "error" || logBuffer.length >= 100) {
      await flush();
    }
  }

  /**
   * Close logger and flush remaining logs
   */
  async function close() {
    if (closed) {
      return;
    }

    await flush();
    closed = true;
  }

  return {
    /**
     * Log info message
     * @param {string} phase
     * @param {string} message
     * @param {Object} [data]
     */
    info: (phase, message, data) => log("info", phase, message, data),

    /**
     * Log warning message
     * @param {string} phase
     * @param {string} message
     * @param {Object} [data]
     */
    warn: (phase, message, data) => log("warn", phase, message, data),

    /**
     * Log error message
     * @param {string} phase
     * @param {string} message
     * @param {Object} [data]
     */
    error: (phase, message, data) => log("error", phase, message, data),

    /**
     * Log debug message
     * @param {string} phase
     * @param {string} message
     * @param {Object} [data]
     */
    debug: (phase, message, data) => log("debug", phase, message, data),

    /**
     * Flush logs to file
     */
    flush,

    /**
     * Close logger and flush
     */
    close,

    /**
     * Get log file path
     */
    getLogFilePath: () => logFilePath
  };
}

/**
 * @typedef {Object} ModuleLogger
 * @property {(phase: string, message: string, data?: Object) => Promise<void>} info
 * @property {(phase: string, message: string, data?: Object) => Promise<void>} warn
 * @property {(phase: string, message: string, data?: Object) => Promise<void>} error
 * @property {(phase: string, message: string, data?: Object) => Promise<void>} debug
 * @property {() => Promise<void>} flush
 * @property {() => Promise<void>} close
 * @property {() => string} getLogFilePath
 */
