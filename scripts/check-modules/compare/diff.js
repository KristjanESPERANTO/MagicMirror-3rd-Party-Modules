import {buildDiffMarkdown} from "./diff-markdown.js";
import fsPromises from "node:fs/promises";
import path from "node:path";

const {readFile, writeFile} = fsPromises;

export const DIFF_OUTPUT_FILES = {
  json: "diff.json",
  markdown: "diff.md"
};

const DEFAULT_NUMERIC_WARNING_TOLERANCE = 0;
const STATS_NUMERIC_WARNING_TOLERANCE = {
  modulesWithImageCounter: 1,
  modulesWithIssuesCounter: 1,
  issueCounter: 3
};

const DEFAULT_MAP_WARNING_TOLERANCE = 0;
const STATS_MAP_WARNING_TOLERANCE = {
  repositoryHoster: 1,
  maintainer: 1
};

const MAX_TEXT_DIFF_PREVIEW = 20;
const LAST_UPDATE_REGEX = /^last update:/iu;

function findArtifact (runResult, artifactId) {
  const artifacts = runResult?.capturedArtifacts ?? [];
  return artifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

async function loadJsonArtifact (runDirectory, runResult, artifactId) {
  const artifact = findArtifact(runResult, artifactId);
  if (!artifact) {
    return {status: "missing", reason: `Artifact '${artifactId}' was not captured for ${runResult?.label ?? "unknown"}.`};
  }

  const stepDir = path.join(runDirectory, runResult.label ?? "");
  const absolutePath = path.join(stepDir, artifact.relativePath);

  try {
    const file = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(file);
    return {status: "ok", path: absolutePath, data: parsed};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {status: "error", reason: `Failed to read '${artifactId}' for ${runResult.label}: ${message}`};
  }
}

async function loadTextArtifact (runDirectory, runResult, artifactId) {
  const artifact = findArtifact(runResult, artifactId);
  if (!artifact) {
    return {status: "missing", reason: `Artifact '${artifactId}' was not captured for ${runResult?.label ?? "unknown"}.`};
  }

  const stepDir = path.join(runDirectory, runResult.label ?? "");
  const absolutePath = path.join(stepDir, artifact.relativePath);

  try {
    const file = await readFile(absolutePath, "utf8");
    return {status: "ok", path: absolutePath, data: file};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {status: "error", reason: `Failed to read '${artifactId}' for ${runResult.label}: ${message}`};
  }
}

function asModuleIndex (modules) {
  const index = new Map();
  if (!Array.isArray(modules)) {
    return index;
  }

  for (const entry of modules) {
    if (entry && typeof entry === "object") {
      const id = entry.id ?? entry.url ?? entry.name;
      if (id) {
        index.set(id, entry);
      }
    }
  }

  return index;
}

function normalizedIssueList (issues) {
  if (!Array.isArray(issues)) {
    return [];
  }

  const unique = new Set();
  for (const issue of issues) {
    if (typeof issue === "string") {
      const trimmed = issue.trim();
      if (trimmed.length > 0) {
        unique.add(trimmed);
      }
    }
  }
  return [...unique].sort();
}

function diffStage5Modules (legacyData, tsData) {
  const legacyModules = asModuleIndex(legacyData?.modules ?? []);
  const tsModules = asModuleIndex(tsData?.modules ?? []);

  const legacyOnly = [];
  const tsOnly = [];
  const issueDifferences = [];

  const ids = new Set([...legacyModules.keys(), ...tsModules.keys()]);

  for (const id of ids) {
    const legacyModule = legacyModules.get(id);
    const tsModule = tsModules.get(id);

    if (legacyModule && tsModule) {
      const legacyIssues = normalizedIssueList(legacyModule.issues ?? []);
      const tsIssues = normalizedIssueList(tsModule.issues ?? []);

      const removedIssues = legacyIssues.filter((issue) => !tsIssues.includes(issue));
      const addedIssues = tsIssues.filter((issue) => !legacyIssues.includes(issue));

      if (removedIssues.length > 0 || addedIssues.length > 0) {
        issueDifferences.push({
          id,
          name: legacyModule.name ?? tsModule.name ?? id,
          removedIssues,
          addedIssues
        });
      }
    } else if (legacyModule) {
      legacyOnly.push({id, name: legacyModule.name ?? id});
    } else if (tsModule) {
      tsOnly.push({id, name: tsModule.name ?? id});
    }
  }

  return {
    legacyOnly,
    tsOnly,
    issueDifferences,
    hasDifferences: legacyOnly.length > 0 || tsOnly.length > 0 || issueDifferences.length > 0,
    hasWarnings: false
  };
}

function diffCountMap (legacyMap, tsMap, tolerance = 0) {
  const legacyEntries = legacyMap && typeof legacyMap === "object" ? legacyMap : {};
  const tsEntries = tsMap && typeof tsMap === "object" ? tsMap : {};

  const keys = new Set([...Object.keys(legacyEntries), ...Object.keys(tsEntries)]);
  const differences = [];
  const warnings = [];

  for (const key of keys) {
    const legacyRaw = legacyEntries[key] ?? 0;
    const tsRaw = tsEntries[key] ?? 0;

    const legacyValue = typeof legacyRaw === "number" ? legacyRaw : Number(legacyRaw);
    const tsValue = typeof tsRaw === "number" ? tsRaw : Number(tsRaw);

    const valuesAreNumeric = !Number.isNaN(legacyValue) && !Number.isNaN(tsValue);

    if (!valuesAreNumeric) {
      if (legacyRaw !== tsRaw) {
        differences.push({key, legacyValue: legacyRaw, tsValue: tsRaw, delta: null, tolerance});
      }
    } else if (legacyValue !== tsValue) {
      const delta = tsValue - legacyValue;
      const entry = {key, legacyValue, tsValue, delta, tolerance};
      if (Math.abs(delta) <= tolerance) {
        warnings.push(entry);
      } else {
        differences.push(entry);
      }
    }
  }

  return {
    differences,
    warnings,
    hasDifferences: differences.length > 0,
    hasWarnings: warnings.length > 0
  };
}

function classifyNumericDifference (key, legacyValueRaw, tsValueRaw) {
  const legacyValue = typeof legacyValueRaw === "number" ? legacyValueRaw : Number(legacyValueRaw ?? 0);
  const tsValue = typeof tsValueRaw === "number" ? tsValueRaw : Number(tsValueRaw ?? 0);

  if (!Number.isFinite(legacyValue) || !Number.isFinite(tsValue)) {
    if (legacyValueRaw === tsValueRaw) {
      return {severity: null};
    }

    return {
      severity: "difference",
      entry: {
        key,
        legacyValue: legacyValueRaw ?? null,
        tsValue: tsValueRaw ?? null,
        delta: null,
        tolerance: DEFAULT_NUMERIC_WARNING_TOLERANCE
      }
    };
  }

  if (legacyValue === tsValue) {
    return {severity: null};
  }

  const tolerance = STATS_NUMERIC_WARNING_TOLERANCE[key] ?? DEFAULT_NUMERIC_WARNING_TOLERANCE;
  const delta = tsValue - legacyValue;
  const entry = {key, legacyValue, tsValue, delta, tolerance};

  if (Math.abs(delta) <= tolerance) {
    return {severity: "warning", entry};
  }

  return {severity: "difference", entry};
}

function isPlainObject (value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function diffStats (legacyStats, tsStats) {
  if (!legacyStats || !tsStats) {
    return {hasDifferences: true, hasWarnings: false, numeric: {differences: [], warnings: []}, maps: {differences: [], warnings: []}, missing: true};
  }

  const ignoredKeys = new Set(["lastUpdate"]);
  const numericDifferences = [];
  const numericWarnings = [];
  const mapDifferences = [];
  const mapWarnings = [];

  const legacyEntries = typeof legacyStats === "object" && legacyStats !== null ? legacyStats : {};
  const tsEntries = typeof tsStats === "object" && tsStats !== null ? tsStats : {};
  const keys = new Set([...Object.keys(legacyEntries), ...Object.keys(tsEntries)]);

  for (const key of keys) {
    if (!ignoredKeys.has(key)) {
      const legacyValue = legacyEntries[key];
      const tsValue = tsEntries[key];
      const isMapValue = isPlainObject(legacyValue) || isPlainObject(tsValue);

      if (isMapValue) {
        const tolerance = STATS_MAP_WARNING_TOLERANCE[key] ?? DEFAULT_MAP_WARNING_TOLERANCE;
        const diff = diffCountMap(legacyValue ?? {}, tsValue ?? {}, tolerance);
        if (diff.hasDifferences) {
          mapDifferences.push({key, differences: diff.differences});
        }
        if (diff.hasWarnings) {
          mapWarnings.push({key, warnings: diff.warnings});
        }
      } else {
        const classification = classifyNumericDifference(key, legacyValue, tsValue);
        if (classification.severity === "difference" && classification.entry) {
          numericDifferences.push(classification.entry);
        } else if (classification.severity === "warning" && classification.entry) {
          numericWarnings.push(classification.entry);
        }
      }
    }
  }

  return {
    numeric: {
      differences: numericDifferences,
      warnings: numericWarnings
    },
    maps: {
      differences: mapDifferences,
      warnings: mapWarnings
    },
    hasDifferences: numericDifferences.length > 0 || mapDifferences.length > 0,
    hasWarnings: numericWarnings.length > 0 || mapWarnings.length > 0,
    missing: false
  };
}

function normalizeNewlines (content) {
  return (content ?? "").replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

function normalizeMarkdownReport (content) {
  const normalized = normalizeNewlines(content);
  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !LAST_UPDATE_REGEX.test(line.trim()));

  return lines.join("\n").trim();
}

function normalizeHtmlReport (content) {
  return normalizeNewlines(content).trim();
}

function summarizeLineDifferences (legacyText, tsText, limit = MAX_TEXT_DIFF_PREVIEW) {
  const legacyLines = legacyText.split("\n");
  const tsLines = tsText.split("\n");
  const maxLines = Math.max(legacyLines.length, tsLines.length);
  const differences = [];

  for (let index = 0; index < maxLines; index += 1) {
    const legacyLine = legacyLines[index] ?? null;
    const tsLine = tsLines[index] ?? null;

    if (legacyLine !== tsLine) {
      differences.push({
        line: index + 1,
        legacy: legacyLine,
        ts: tsLine
      });

      if (differences.length >= limit) {
        break;
      }
    }
  }

  return differences;
}

function diffTextReport (legacyText, tsText, normalizer) {
  const legacyNormalized = normalizer(legacyText ?? "");
  const tsNormalized = normalizer(tsText ?? "");

  if (legacyNormalized === tsNormalized) {
    return {
      hasDifferences: false,
      hasWarnings: false,
      differences: [],
      warnings: []
    };
  }

  return {
    hasDifferences: true,
    hasWarnings: false,
    differences: summarizeLineDifferences(legacyNormalized, tsNormalized),
    warnings: []
  };
}

function diffReports ({markdownLegacy, markdownTs, htmlLegacy, htmlTs}) {
  const markdown = diffTextReport(markdownLegacy, markdownTs, normalizeMarkdownReport);
  const html = diffTextReport(htmlLegacy, htmlTs, normalizeHtmlReport);

  return {
    markdown,
    html,
    hasDifferences: markdown.hasDifferences || html.hasDifferences,
    hasWarnings: markdown.hasWarnings || html.hasWarnings
  };
}

export async function performDiff ({runDirectory, results}) {
  const legacyRun = results.find((run) => run.label === "legacy");
  const tsRun = results.find((run) => run.label === "ts");

  if (!legacyRun || !tsRun) {
    return {status: "error", reason: "Missing legacy or TypeScript run results."};
  }

  if (legacyRun.skipped || tsRun.skipped) {
    return {status: "skipped", reason: "One or more commands were skipped."};
  }

  const legacyExitCode = legacyRun.exitCode ?? 0;
  const tsExitCode = tsRun.exitCode ?? 0;
  if (legacyExitCode !== 0 || tsExitCode !== 0) {
    return {status: "skipped", reason: "Diff skipped because one or more commands exited non-zero."};
  }

  const stage5Legacy = await loadJsonArtifact(runDirectory, legacyRun, "modules.stage.5.json");
  const stage5Ts = await loadJsonArtifact(runDirectory, tsRun, "modules.stage.5.json");

  if (stage5Legacy.status !== "ok" || stage5Ts.status !== "ok") {
    const reasons = [stage5Legacy, stage5Ts]
      .filter((item) => item.status !== "ok")
      .map((item) => item.reason ?? "Unknown stage 5 artifact error.");
    return {status: "error", reason: reasons.join(" ")};
  }

  const statsLegacy = await loadJsonArtifact(runDirectory, legacyRun, "stats.json");
  const statsTs = await loadJsonArtifact(runDirectory, tsRun, "stats.json");

  if (statsLegacy.status !== "ok" || statsTs.status !== "ok") {
    const reasons = [statsLegacy, statsTs]
      .filter((item) => item.status !== "ok")
      .map((item) => item.reason ?? "Unknown stats artifact error.");
    return {status: "error", reason: reasons.join(" ")};
  }

  const markdownLegacy = await loadTextArtifact(runDirectory, legacyRun, "result.md");
  const markdownTs = await loadTextArtifact(runDirectory, tsRun, "result.md");

  if (markdownLegacy.status !== "ok" || markdownTs.status !== "ok") {
    const reasons = [markdownLegacy, markdownTs]
      .filter((item) => item.status !== "ok")
      .map((item) => item.reason ?? "Unknown report artifact error.");
    return {status: "error", reason: reasons.join(" ")};
  }

  const htmlLegacy = await loadTextArtifact(runDirectory, legacyRun, "result.html");
  const htmlTs = await loadTextArtifact(runDirectory, tsRun, "result.html");

  if (htmlLegacy.status !== "ok" || htmlTs.status !== "ok") {
    const reasons = [htmlLegacy, htmlTs]
      .filter((item) => item.status !== "ok")
      .map((item) => item.reason ?? "Unknown report artifact error.");
    return {status: "error", reason: reasons.join(" ")};
  }

  const stage5Diff = diffStage5Modules(stage5Legacy.data, stage5Ts.data);
  const statsDiff = diffStats(statsLegacy.data, statsTs.data);
  const reportsDiff = diffReports({
    markdownLegacy: markdownLegacy.data,
    markdownTs: markdownTs.data,
    htmlLegacy: htmlLegacy.data,
    htmlTs: htmlTs.data
  });

  const summary = {
    stage5: stage5Diff,
    stats: statsDiff,
    reports: reportsDiff
  };

  const hasDifferences = Boolean(stage5Diff.hasDifferences || statsDiff.hasDifferences || reportsDiff.hasDifferences);
  const hasWarnings = Boolean(stage5Diff.hasWarnings || statsDiff.hasWarnings || reportsDiff.hasWarnings);

  const diffJsonPath = path.join(runDirectory, DIFF_OUTPUT_FILES.json);
  const diffMarkdownPath = path.join(runDirectory, DIFF_OUTPUT_FILES.markdown);

  await writeFile(diffJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(diffMarkdownPath, `${buildDiffMarkdown(summary)}\n`, "utf8");

  if (hasDifferences) {
    console.warn("[compare] Differences detected between legacy and TypeScript outputs.");
  } else if (hasWarnings) {
    console.warn("[compare] Outputs match within configured thresholds; review warnings for context.");
  } else {
    console.log("[compare] No differences detected between legacy and TypeScript outputs.");
  }

  let status = "matched";
  if (hasDifferences) {
    status = "differences";
  } else if (hasWarnings) {
    status = "warnings";
  }

  return {
    status,
    summary,
    summaryPath: diffJsonPath,
    markdownPath: diffMarkdownPath
  };
}

export {
  diffStage5Modules,
  diffStats,
  diffReports,
  normalizeMarkdownReport as normalizeMarkdownForDiff,
  summarizeLineDifferences
};
