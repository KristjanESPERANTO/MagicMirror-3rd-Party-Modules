import {
  buildRunSummaryMarkdown,
  formatRunDuration
} from "../run-summary.js";

import assert from "node:assert/strict";
import test from "node:test";

test("formatRunDuration formats durations", () => {
  assert.equal(formatRunDuration(-5), "unknown");
  assert.equal(formatRunDuration(0), "<1s");
  assert.equal(formatRunDuration(650), "<1s");
  assert.equal(formatRunDuration(1500), "2s");
  assert.equal(formatRunDuration(61_000), "1m 1s");
  assert.equal(formatRunDuration(7_500_000), "2h 5m");
});

test("buildRunSummaryMarkdown includes key sections", () => {
  const startedAt = new Date("2025-10-04T10:00:00Z");
  const finishedAt = new Date("2025-10-04T10:01:30Z");

  const markdown = buildRunSummaryMarkdown({
    runId: "test-run",
    startedAt,
    finishedAt,
    stats: {
      moduleCounter: 12,
      modulesWithIssuesCounter: 3,
      issueCounter: 8,
      modulesWithImageCounter: 5,
      repositoryHoster: {
        github: 9,
        gitlab: 3
      },
      maintainer: {
        alice: 4,
        bob: 3,
        carol: 2
      }
    },
    config: {
      groups: {
        fast: true,
        deep: false
      },
      integrations: {
        npmCheckUpdates: true,
        npmDeprecatedCheck: false,
        eslint: true
      }
    },
    configSources: [
      {kind: "default", path: "/tmp/check-groups.config.json", applied: true},
      {kind: "local", path: "/tmp/check-groups.config.local.json", missing: true}
    ],
    artifactLinks: [
      {label: "result.md", path: "../../website/result.md"},
      {label: "stats.json", path: "../../website/data/stats.json"}
    ],
    issueSummaries: [
      {
        name: "Module A",
        url: "https://example.com/a",
        issues: ["Issue one", "Issue two"]
      },
      {
        name: "Module B",
        issues: ["Issue"]
      }
    ],
    disabledToggles: ["deep", "npmDeprecatedCheck"],
    issueSummaryLimit: 1
  });

  assert.ok(markdown.includes("Run ID: `test-run`"));
  assert.ok(markdown.includes("Duration: 1m 30s"));
  assert.ok(markdown.includes("| groups.deep | ❌ |"));
  assert.ok(markdown.includes("- [result.md](../../website/result.md)"));
  assert.ok(markdown.includes("1. [Module A](https://example.com/a) — 2 issues"));
  assert.ok(markdown.includes("…and 1 additional module with issues"));
  assert.ok(markdown.includes("Top maintainers"));
  assert.ok(markdown.includes("Repository hosts"));
  assert.ok(markdown.includes("Config sources"));
  assert.ok(markdown.endsWith("full issue breakdown.\n"));
});
