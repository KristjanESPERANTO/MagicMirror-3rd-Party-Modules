import { createLogger, createStageProgressLogger } from "../logger.js";
import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("Logger", () => {
  describe("createLogger", () => {
    it("should create a logger with default level info", () => {
      const logger = createLogger();
      assert.strictEqual(logger.level, "info");
    });

    it("should create a logger with custom level", () => {
      const logger = createLogger({ level: "debug" });
      assert.strictEqual(logger.level, "debug");
    });

    it("should allow changing the log level", () => {
      const logger = createLogger({ level: "warn" });
      assert.strictEqual(logger.level, "warn");
      logger.level = "debug";
      assert.strictEqual(logger.level, "debug");
    });

    it("should throw error for invalid log level", () => {
      assert.throws(
        () => createLogger({ level: "invalid" }),
        /Unknown log level/u
      );
    });

    it("should log messages at appropriate levels", () => {
      const mockWriter = {
        error: mock.fn(),
        warn: mock.fn(),
        info: mock.fn(),
        debug: mock.fn(),
        log: mock.fn()
      };

      const logger = createLogger({ level: "info", writer: mockWriter });

      logger.info("test info");
      logger.debug("test debug");
      logger.error("test error");

      // Info should be logged
      assert.strictEqual(mockWriter.info.mock.calls.length, 1);
      assert.match(mockWriter.info.mock.calls[0].arguments[0], /test info/u);

      // Debug should not be logged (level is info)
      assert.strictEqual(mockWriter.debug.mock.calls.length, 0);

      // Error should be logged
      assert.strictEqual(mockWriter.error.mock.calls.length, 1);
      assert.match(mockWriter.error.mock.calls[0].arguments[0], /test error/u);
    });

    it("should create child logger with combined name", () => {
      const mockWriter = {
        info: mock.fn()
      };

      const parent = createLogger({ name: "parent", writer: mockWriter });
      const child = parent.child("child");

      child.info("test");

      assert.strictEqual(mockWriter.info.mock.calls.length, 1);
      assert.match(mockWriter.info.mock.calls[0].arguments[0], /parent:child/u);
    });

    it("should include timestamp in log output", () => {
      const mockWriter = {
        info: mock.fn()
      };

      const logger = createLogger({ writer: mockWriter });
      logger.info("test");

      assert.strictEqual(mockWriter.info.mock.calls.length, 1);
      // Check for ISO timestamp format
      assert.match(mockWriter.info.mock.calls[0].arguments[0], /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u);
    });

    it("should support multiple detail arguments", () => {
      const mockWriter = {
        info: mock.fn()
      };

      const logger = createLogger({ writer: mockWriter });
      logger.info("test", { key: "value" }, ["array"]);

      assert.strictEqual(mockWriter.info.mock.calls.length, 1);
      assert.strictEqual(mockWriter.info.mock.calls[0].arguments.length, 3);
      assert.match(mockWriter.info.mock.calls[0].arguments[0], /test/u);
      assert.deepStrictEqual(mockWriter.info.mock.calls[0].arguments[1], { key: "value" });
      assert.deepStrictEqual(mockWriter.info.mock.calls[0].arguments[2], ["array"]);
    });
  });

  describe("createStageProgressLogger", () => {
    it("should log stage start", () => {
      const mockWriter = {
        info: mock.fn()
      };
      const baseLogger = createLogger({ writer: mockWriter });
      const progressLogger = createStageProgressLogger(baseLogger);

      progressLogger.start({ id: "test-stage", name: "Test Stage" }, { stepNumber: 1, total: 3 });

      assert.strictEqual(mockWriter.info.mock.calls.length, 1);
      assert.match(mockWriter.info.mock.calls[0].arguments[0], /▶︎.*\[1\/3\].*test-stage.*Test Stage/u);
    });

    it("should log stage success", () => {
      const mockWriter = {
        info: mock.fn()
      };
      const baseLogger = createLogger({ writer: mockWriter });
      const progressLogger = createStageProgressLogger(baseLogger);

      progressLogger.succeed(
        { id: "test-stage", name: "Test Stage" },
        { stepNumber: 1, total: 3, formattedDuration: "1.5s" }
      );

      assert.strictEqual(mockWriter.info.mock.calls.length, 1);
      assert.match(mockWriter.info.mock.calls[0].arguments[0], /✔︎.*\[1\/3\].*test-stage.*Test Stage.*1\.5s/u);
    });

    it("should log stage failure with error", () => {
      const mockWriter = {
        error: mock.fn()
      };
      const baseLogger = createLogger({ writer: mockWriter });
      const progressLogger = createStageProgressLogger(baseLogger);

      const error = new Error("Test error");
      progressLogger.fail(
        { id: "test-stage", name: "Test Stage" },
        { stepNumber: 1, total: 3, error }
      );

      assert.strictEqual(mockWriter.error.mock.calls.length, 2);
      assert.match(mockWriter.error.mock.calls[0].arguments[0], /✖︎.*\[1\/3\].*test-stage.*Test Stage.*failed/u);
      assert.match(mockWriter.error.mock.calls[1].arguments[0], /Test error/u);
    });
  });
});
