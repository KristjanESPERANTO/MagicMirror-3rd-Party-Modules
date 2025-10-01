import fsPromises from "node:fs/promises";
import path from "node:path";

const {readFile, writeFile} = fsPromises;

export const DIFF_OUTPUT_FILES = {
  json: "diff.json",
  markdown: "diff.md"
};

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
    hasDifferences: legacyOnly.length > 0 || tsOnly.length > 0 || issueDifferences.length > 0
  };
}

function diffCountMap (legacyMap, tsMap) {
  const legacyEntries = legacyMap && typeof legacyMap === "object" ? legacyMap : {};
  const tsEntries = tsMap && typeof tsMap === "object" ? tsMap : {};

  const keys = new Set([...Object.keys(legacyEntries), ...Object.keys(tsEntries)]);
  const differences = [];

  for (const key of keys) {
    const legacyValue = legacyEntries[key] ?? 0;
    const tsValue = tsEntries[key] ?? 0;
    if (legacyValue !== tsValue) {
      differences.push({key, legacyValue, tsValue});
    }
  }

  return {
    differences,
    hasDifferences: differences.length > 0
  };
}

function diffStats (legacyStats, tsStats) {
  if (!legacyStats || !tsStats) {
    return {hasDifferences: true, numericDifferences: [], mapDifferences: [], missing: true};
  }

  const ignoredKeys = new Set(["lastUpdate"]);
  const numericDifferences = [];
  const mapDifferences = [];

  for (const [key, legacyValue] of Object.entries(legacyStats)) {
    if (!ignoredKeys.has(key)) {
      const tsValue = tsStats[key];

      if (typeof legacyValue === "number" || typeof legacyValue === "string") {
        if (legacyValue !== tsValue) {
          numericDifferences.push({key, legacyValue, tsValue});
        }
      } else if (legacyValue && typeof legacyValue === "object" && !Array.isArray(legacyValue)) {
        const mapDiff = diffCountMap(legacyValue, tsValue ?? {});
        if (mapDiff.hasDifferences) {
          mapDifferences.push({key, differences: mapDiff.differences});
        }
      }
    }
  }

  for (const [key, tsValue] of Object.entries(tsStats)) {
    const isIgnored = ignoredKeys.has(key);
    const legacyHasKey = typeof legacyStats === "object" && legacyStats !== null && Object.hasOwn(legacyStats, key);
    if (!isIgnored && !legacyHasKey) {
      numericDifferences.push({key, legacyValue: null, tsValue});
    }
  }

  return {
    numericDifferences,
    mapDifferences,
    hasDifferences: numericDifferences.length > 0 || mapDifferences.length > 0
  };
}

function buildDiffMarkdown ({stage5, stats}) {
  const lines = ["# check-modules comparison diff", ""];

  if (!stage5 || !stats) {
    lines.push("Comparison did not run due to missing data.");
    return lines.join("\n");
  }

  if (stage5.hasDifferences || stats.hasDifferences) {
    lines.push("⚠️ Differences detected between legacy and TypeScript artifacts.");
  } else {
    lines.push("✅ Legacy and TypeScript outputs match for evaluated artifacts.");
  }

  lines.push("");
  lines.push("## Stage 5 modules");

  if (stage5.hasDifferences) {
    if (stage5.legacyOnly.length > 0) {
      lines.push("### Modules only in legacy output");
      for (const module of stage5.legacyOnly) {
        lines.push(`- ${module.name} (${module.id})`);
      }
      lines.push("");
    }

    if (stage5.tsOnly.length > 0) {
      lines.push("### Modules only in TypeScript output");
      for (const module of stage5.tsOnly) {
        lines.push(`- ${module.name} (${module.id})`);
      }
      lines.push("");
    }

    if (stage5.issueDifferences.length > 0) {
      lines.push("### Issue differences");
      for (const diff of stage5.issueDifferences) {
        lines.push(`- ${diff.name} (${diff.id})`);
        if (diff.removedIssues.length > 0) {
          lines.push("  - Removed issues:");
          for (const issue of diff.removedIssues) {
            lines.push(`    - ${issue}`);
          }
        }
        if (diff.addedIssues.length > 0) {
          lines.push("  - Added issues:");
          for (const issue of diff.addedIssues) {
            lines.push(`    + ${issue}`);
          }
        }
      }
      lines.push("");
    }

    if (stage5.legacyOnly.length === 0 && stage5.tsOnly.length === 0 && stage5.issueDifferences.length === 0) {
      lines.push("No module-level differences found after normalization.");
      lines.push("");
    }
  } else {
    lines.push("No module-level differences found.");
  }

  lines.push("## Stats");

  if (stats.hasDifferences) {
    if (stats.numericDifferences.length > 0) {
      lines.push("### Numeric differences");
      for (const diff of stats.numericDifferences) {
        lines.push(`- ${diff.key}: legacy=${diff.legacyValue ?? "∅"}, ts=${diff.tsValue ?? "∅"}`);
      }
      lines.push("");
    }

    if (stats.mapDifferences.length > 0) {
      lines.push("### Map differences");
      for (const mapDiff of stats.mapDifferences) {
        lines.push(`- ${mapDiff.key}`);
        for (const entry of mapDiff.differences) {
          lines.push(`  - ${entry.key}: legacy=${entry.legacyValue}, ts=${entry.tsValue}`);
        }
      }
      lines.push("");
    }

    if (stats.numericDifferences.length === 0 && stats.mapDifferences.length === 0) {
      lines.push("No stat differences detected after normalization.");
      lines.push("");
    }
  } else {
    lines.push("Stats match after ignoring timestamp fields.");
  }

  return lines.join("\n");
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

  const stage5Diff = diffStage5Modules(stage5Legacy.data, stage5Ts.data);
  const statsDiff = diffStats(statsLegacy.data, statsTs.data);

  const summary = {
    stage5: stage5Diff,
    stats: statsDiff
  };

  const hasDifferences = stage5Diff.hasDifferences || statsDiff.hasDifferences;

  const diffJsonPath = path.join(runDirectory, DIFF_OUTPUT_FILES.json);
  const diffMarkdownPath = path.join(runDirectory, DIFF_OUTPUT_FILES.markdown);

  await writeFile(diffJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(diffMarkdownPath, `${buildDiffMarkdown(summary)}\n`, "utf8");

  if (hasDifferences) {
    console.warn("[compare] Differences detected between legacy and TypeScript outputs.");
  } else {
    console.log("[compare] No differences detected between legacy and TypeScript outputs.");
  }

  return {
    status: hasDifferences ? "differences" : "matched",
    summary,
    summaryPath: diffJsonPath,
    markdownPath: diffMarkdownPath
  };
}
