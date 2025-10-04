function resolveTimestamp (value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Number.NaN;
}

function formatTimestamp (value) {
  const timestamp = resolveTimestamp(value);
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }
  return new Date(timestamp).toISOString();
}

function isFiniteNumber (value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatRunDuration (milliseconds) {
  if (!isFiniteNumber(milliseconds) || milliseconds < 0) {
    return "unknown";
  }

  if (milliseconds < 1000) {
    return "<1s";
  }

  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatBoolean (value) {
  return value ? "✅" : "❌";
}

function formatTableRow (label, value) {
  return `| ${label} | ${value} |`;
}

function toPosixPathString (inputPath) {
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    return inputPath;
  }

  return inputPath.replace(/\\/gu, "/");
}

function getTopEntries (record = {}, limit = 5) {
  if (!record || typeof record !== "object") {
    return [];
  }

  return Object.entries(record)
    .sort(([, first], [, second]) => Number(second) - Number(first))
    .slice(0, Math.max(0, limit));
}

function describeConfigSource (source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  let status = "skipped";
  if (source.applied) {
    status = "applied";
  } else if (source.missing) {
    status = "missing";
  }

  const label = source.kind ?? source.path ?? "unknown";
  const path = typeof source.path === "string" ? source.path : null;
  if (path) {
    return `- ${label}: ${status} (${path})`;
  }

  return `- ${label}: ${status}`;
}

function appendCheckGroupSection (lines, config) {
  lines.push("## Check group configuration", "");

  lines.push("| Toggle | Enabled |", "|:-------|:-------:|");

  if (config && typeof config === "object") {
    const fastRow = formatTableRow("groups.fast", formatBoolean(Boolean(config.groups?.fast)));
    const deepRow = formatTableRow("groups.deep", formatBoolean(Boolean(config.groups?.deep)));
    const ncuRow = formatTableRow(
      "integrations.npmCheckUpdates",
      formatBoolean(Boolean(config.integrations?.npmCheckUpdates))
    );
    const deprecatedRow = formatTableRow(
      "integrations.npmDeprecatedCheck",
      formatBoolean(Boolean(config.integrations?.npmDeprecatedCheck))
    );
    const eslintRow = formatTableRow(
      "integrations.eslint",
      formatBoolean(Boolean(config.integrations?.eslint))
    );

    lines.push(fastRow, deepRow, ncuRow, deprecatedRow, eslintRow);
  } else {
    lines.push(formatTableRow("(unknown)", "❓"));
  }

  lines.push("");
}

function appendConfigSourcesSection (lines, configSources) {
  if (!Array.isArray(configSources) || configSources.length === 0) {
    return;
  }

  lines.push("### Config sources", "");

  const descriptions = configSources
    .map((source) => describeConfigSource(source))
    .filter((entry) => typeof entry === "string" && entry.length > 0);

  if (descriptions.length === 0) {
    lines.push("- (none)", "");
    return;
  }

  for (const description of descriptions) {
    lines.push(description);
  }

  lines.push("");
}

function appendArtifactsSection (lines, artifactLinks) {
  if (!Array.isArray(artifactLinks) || artifactLinks.length === 0) {
    return;
  }

  const entries = artifactLinks.filter((artifact) => artifact && (artifact.label || artifact.path));
  if (entries.length === 0) {
    return;
  }

  lines.push("## Output artifacts", "");

  for (const artifact of entries) {
    const label = artifact.label ?? artifact.id ?? artifact.path ?? "artifact";
    if (typeof artifact.path === "string" && artifact.path.length > 0) {
      const normalized = toPosixPathString(artifact.path);
      lines.push(`- [${label}](${normalized})`);
    } else {
      lines.push(`- ${label}`);
    }
  }

  lines.push("");
}

function appendTopMaintainersSection (lines, stats) {
  const topMaintainers = getTopEntries(stats?.maintainer, 5);
  if (topMaintainers.length === 0) {
    return;
  }

  lines.push("## Top maintainers", "");
  lines.push("| Maintainer | Modules |", "|:-----------|--------:|");

  for (const [maintainer, count] of topMaintainers) {
    lines.push(formatTableRow(maintainer, count));
  }

  lines.push("");
}

function appendRepositoryHostsSection (lines, stats) {
  const topHosts = getTopEntries(stats?.repositoryHoster, 5);
  if (topHosts.length === 0) {
    return;
  }

  lines.push("## Repository hosts", "");
  lines.push("| Host | Modules |", "|:-----|--------:|");

  for (const [host, count] of topHosts) {
    lines.push(formatTableRow(host, count));
  }

  lines.push("");
}

function appendIssuesSection (lines, issueSummaries, limit) {
  const normalizedLimit = Math.max(0, limit ?? 10);
  const entries = Array.isArray(issueSummaries)
    ? issueSummaries.filter(Boolean).slice(0, normalizedLimit)
    : [];

  lines.push("## Modules with issues", "");

  if (entries.length === 0) {
    lines.push("- None 🎉", "");
    return;
  }

  for (let index = 0; index < entries.length; index += 1) {
    const summary = entries[index];
    const issueCount = Array.isArray(summary.issues) ? summary.issues.length : 0;
    const name = summary.name ?? "Unknown module";
    const title = typeof summary.url === "string" && summary.url.length > 0
      ? `[${name}](${summary.url})`
      : name;
    const suffix = issueCount === 1 ? "issue" : "issues";
    lines.push(`${index + 1}. ${title} — ${issueCount} ${suffix}`);
  }

  if (Array.isArray(issueSummaries) && issueSummaries.length > entries.length) {
    const remaining = issueSummaries.length - entries.length;
    const suffix = remaining === 1 ? "module" : "modules";
    lines.push("", `_…and ${remaining} additional ${suffix} with issues._`);
  }

  lines.push("");
}

function computeDurationMs (startedAt, finishedAt) {
  const start = resolveTimestamp(startedAt);
  const end = resolveTimestamp(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return Number.NaN;
  }
  return Math.max(0, end - start);
}

export function buildRunSummaryMarkdown ({
  runId,
  startedAt,
  finishedAt,
  stats = {},
  config,
  configSources = [],
  artifactLinks = [],
  issueSummaries = [],
  disabledToggles = [],
  issueSummaryLimit = 10
} = {}) {
  const lines = [];

  const durationMs = computeDurationMs(startedAt, finishedAt);
  const disabledLabel = Array.isArray(disabledToggles) && disabledToggles.length > 0
    ? disabledToggles.join(", ")
    : "none";
  const hostCount = Object.keys(stats.repositoryHoster ?? {}).length;

  lines.push("# check-modules run summary", "");
  lines.push(`- Run ID: \`${runId ?? "unknown"}\``);
  lines.push(`- Started: ${formatTimestamp(startedAt)}`);
  lines.push(`- Finished: ${formatTimestamp(finishedAt)}`);
  lines.push(`- Duration: ${formatRunDuration(durationMs)}`);
  lines.push(`- Modules analyzed: ${stats.moduleCounter ?? 0}`);
  lines.push(`- Modules with issues: ${stats.modulesWithIssuesCounter ?? 0}`);
  lines.push(`- Issues detected: ${stats.issueCounter ?? 0}`);
  lines.push(`- Modules with images: ${stats.modulesWithImageCounter ?? 0}`);
  lines.push(`- Repository hosts tracked: ${hostCount}`);
  lines.push(`- Disabled toggles: ${disabledLabel}`);
  lines.push("");

  appendCheckGroupSection(lines, config);
  appendConfigSourcesSection(lines, configSources);
  appendArtifactsSection(lines, artifactLinks);
  appendTopMaintainersSection(lines, stats);
  appendRepositoryHostsSection(lines, stats);
  appendIssuesSection(lines, issueSummaries, issueSummaryLimit);

  lines.push("---", "");
  lines.push(
    "Generated by `scripts/check-modules/index.ts`. See `website/result.md` for the full issue breakdown.",
    ""
  );

  return `${lines.join("\n")}`;
}
