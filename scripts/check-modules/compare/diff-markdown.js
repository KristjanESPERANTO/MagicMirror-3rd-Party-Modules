export function buildDiffMarkdown (summary) {
  const lines = ["# check-modules comparison diff", ""];
  const stage5 = summary?.stage5;
  const stats = summary?.stats;
  const reports = summary?.reports;

  const hasDifferences = Boolean(stage5?.hasDifferences || stats?.hasDifferences || reports?.hasDifferences);
  const hasWarnings = Boolean(stage5?.hasWarnings || stats?.hasWarnings || reports?.hasWarnings);

  if (hasDifferences) {
    lines.push("⚠️ Differences detected between legacy and TypeScript outputs.");
  } else if (hasWarnings) {
    lines.push("⚠️ Outputs match within configured thresholds, but warnings were recorded.");
  } else {
    lines.push("✅ Legacy and TypeScript outputs match for evaluated artifacts.");
  }

  lines.push("");
  appendStage5Section(lines, stage5);
  appendStatsSection(lines, stats);
  appendReportsSection(lines, reports);

  return lines.join("\n");
}

function formatDelta (delta) {
  if (typeof delta !== "number" || Number.isNaN(delta)) {
    return "n/a";
  }

  const symbol = delta > 0 ? "+" : "";
  return `${symbol}${delta}`;
}

function formatNumericLine (entry, {includeTolerance = false, indent = "-"} = {}) {
  const deltaText = formatDelta(entry.delta);
  const base = `${indent} ${entry.key}: legacy=${entry.legacyValue ?? "∅"}, ts=${entry.tsValue ?? "∅"} (Δ ${deltaText}`;
  return includeTolerance ? `${base}, tolerance ±${entry.tolerance ?? 0})` : `${base})`;
}

function appendStage5Section (lines, stage5) {
  lines.push("## Stage 5 modules");

  if (!stage5) {
    lines.push("Stage 5 comparison unavailable.");
    return;
  }

  if (!stage5.hasDifferences) {
    lines.push("No module-level differences found.");
    return;
  }

  if (stage5.legacyOnly.length > 0) {
    lines.push(
      "### Modules only in legacy output",
      ...stage5.legacyOnly.map((module) => `- ${module.name} (${module.id})`),
      ""
    );
  }

  if (stage5.tsOnly.length > 0) {
    lines.push(
      "### Modules only in TypeScript output",
      ...stage5.tsOnly.map((module) => `- ${module.name} (${module.id})`),
      ""
    );
  }

  if (stage5.issueDifferences.length > 0) {
    lines.push("### Issue differences");
    for (const diff of stage5.issueDifferences) {
      lines.push(`- ${diff.name} (${diff.id})`);
      if (diff.removedIssues.length > 0) {
        lines.push("  - Removed issues:", ...diff.removedIssues.map((issue) => `    - ${issue}`));
      }
      if (diff.addedIssues.length > 0) {
        lines.push("  - Added issues:", ...diff.addedIssues.map((issue) => `    + ${issue}`));
      }
    }
    lines.push("");
  }

  if (stage5.legacyOnly.length === 0 && stage5.tsOnly.length === 0 && stage5.issueDifferences.length === 0) {
    lines.push("No module-level differences found after normalization.", "");
  }
}

function appendNumericSection (lines, title, entries, options = {}) {
  if (entries.length > 0) {
    lines.push(title, ...entries.map((entry) => formatNumericLine(entry, options)), "");
  }
}

function appendMapSection (lines, title, entries, {includeTolerance = false} = {}) {
  if (entries.length === 0) {
    return;
  }

  lines.push(title);
  for (const entry of entries) {
    const source = includeTolerance ? entry.warnings : entry.differences;
    lines.push(`- ${entry.key}`, ...source.map((diff) => formatNumericLine(diff, {includeTolerance, indent: "  -"})));
  }
  lines.push("");
}

function appendStatsSection (lines, stats) {
  lines.push("## Stats");

  if (!stats) {
    lines.push("Stats comparison unavailable.");
    return;
  }

  if (stats.missing) {
    lines.push("Stats artifacts were missing; comparison skipped.");
    return;
  }

  if (!stats.hasDifferences && !stats.hasWarnings) {
    lines.push("Stats match after ignoring timestamp fields.");
    return;
  }

  appendNumericSection(lines, "### Numeric differences", stats.numeric.differences);
  appendNumericSection(lines, "### Numeric warnings (within tolerance)", stats.numeric.warnings, {includeTolerance: true});
  appendMapSection(lines, "### Map differences", stats.maps.differences);
  appendMapSection(lines, "### Map warnings (within tolerance)", stats.maps.warnings, {includeTolerance: true});
}

function appendReportSubSection (lines, label, diff) {
  if (!diff) {
    return;
  }

  if (diff.hasDifferences) {
    lines.push(
      `### ${label} differences`,
      ...diff.differences.map((entry) => {
        const legacyLine = entry.legacy ?? "∅";
        const tsLine = entry.ts ?? "∅";
        return `- Line ${entry.line}: legacy=\`${legacyLine}\`, ts=\`${tsLine}\``;
      }),
      ""
    );
    return;
  }

  lines.push(`### ${label} matched after normalization.`, "");
}

function appendReportsSection (lines, reports) {
  lines.push("## Report artifacts");

  if (!reports) {
    lines.push("Report comparison unavailable.");
    return;
  }

  if (!reports.hasDifferences && !reports.hasWarnings) {
    lines.push("Report artifacts match after normalization.");
    return;
  }

  appendReportSubSection(lines, "result.md", reports.markdown);
  appendReportSubSection(lines, "result.html", reports.html);
}
