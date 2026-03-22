// @ts-nocheck
import process from "node:process";

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function peak(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

function last(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return values[values.length - 1];
}

function summarizeMetric(values) {
  return {
    averageBytes: average(values),
    lastBytes: last(values),
    peakBytes: peak(values)
  };
}

export function createResourceMonitor({
  clearIntervalFn = clearInterval,
  getCpuUsage = (...args) => process.cpuUsage(...args),
  getMemoryUsage = () => process.memoryUsage(),
  now = () => Date.now(),
  sampleIntervalMs = 500,
  setIntervalFn = setInterval
} = {}) {
  const samples = [];
  let cachedSummary = null;
  let cpuStart = null;
  let started = false;
  let startedAtMs = null;
  let timerId = null;

  const recordSample = () => {
    const usage = getMemoryUsage();
    samples.push({
      heapUsedBytes: typeof usage.heapUsed === "number" ? usage.heapUsed : 0,
      rssBytes: typeof usage.rss === "number" ? usage.rss : 0
    });
  };

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      startedAtMs = now();
      cpuStart = getCpuUsage();
      recordSample();
      timerId = setIntervalFn(recordSample, sampleIntervalMs);
    },

    stop() {
      if (cachedSummary) {
        return cachedSummary;
      }

      if (!started) {
        return null;
      }

      if (timerId !== null) {
        clearIntervalFn(timerId);
      }

      recordSample();

      const elapsedMs = Math.max(0, now() - startedAtMs);
      const cpuUsage = getCpuUsage(cpuStart);
      const rssValues = samples.map(sample => sample.rssBytes);
      const heapValues = samples.map(sample => sample.heapUsedBytes);

      cachedSummary = {
        cpu: {
          systemMicros: cpuUsage.system,
          totalMicros: cpuUsage.user + cpuUsage.system,
          userMicros: cpuUsage.user
        },
        memory: {
          heapUsed: summarizeMetric(heapValues),
          rss: summarizeMetric(rssValues)
        },
        monitoringDurationMs: elapsedMs,
        sampleCount: samples.length,
        sampleIntervalMs
      };

      return cachedSummary;
    }
  };
}
