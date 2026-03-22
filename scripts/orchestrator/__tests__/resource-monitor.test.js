import { strict as assert } from "node:assert";
import { createResourceMonitor } from "../resource-monitor.js";
import { test } from "node:test";

test("createResourceMonitor captures cpu and memory summary", () => {
  const memorySnapshots = [
    { heapUsed: 40, rss: 100 },
    { heapUsed: 50, rss: 120 },
    { heapUsed: 45, rss: 110 }
  ];
  const nowValues = [1_000, 1_600];
  let memoryIndex = 0;
  let intervalCallback = null;
  let clearCalled = false;

  const monitor = createResourceMonitor({
    clearIntervalFn: () => {
      clearCalled = true;
    },
    getCpuUsage: (start) => {
      if (!start) {
        return { system: 2_000, user: 1_000 };
      }

      return { system: 1_200, user: 2_800 };
    },
    getMemoryUsage: () => {
      const snapshot = memorySnapshots[Math.min(memoryIndex, memorySnapshots.length - 1)];
      memoryIndex += 1;
      return snapshot;
    },
    now: () => {
      const current = nowValues[Math.min(nowValues.length - 1, 0)];
      nowValues.splice(0, 1);
      return current;
    },
    sampleIntervalMs: 250,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return 123;
    }
  });

  monitor.start();
  intervalCallback();

  const summary = monitor.stop();

  assert.ok(clearCalled);
  assert.strictEqual(summary.sampleIntervalMs, 250);
  assert.strictEqual(summary.sampleCount, 3);
  assert.strictEqual(summary.monitoringDurationMs, 600);
  assert.deepStrictEqual(summary.cpu, {
    systemMicros: 1_200,
    totalMicros: 4_000,
    userMicros: 2_800
  });
  assert.deepStrictEqual(summary.memory.rss, {
    averageBytes: 110,
    lastBytes: 110,
    peakBytes: 120
  });
  assert.deepStrictEqual(summary.memory.heapUsed, {
    averageBytes: 45,
    lastBytes: 45,
    peakBytes: 50
  });
});

test("createResourceMonitor returns cached summary on repeated stop", () => {
  let clearCallCount = 0;

  const monitor = createResourceMonitor({
    clearIntervalFn: () => {
      clearCallCount += 1;
    },
    getCpuUsage: () => ({ system: 0, user: 0 }),
    getMemoryUsage: () => ({ heapUsed: 10, rss: 20 }),
    now: () => 1_000,
    setIntervalFn: () => 1
  });

  monitor.start();
  const first = monitor.stop();
  const second = monitor.stop();

  assert.strictEqual(first, second);
  assert.strictEqual(clearCallCount, 1);
});
