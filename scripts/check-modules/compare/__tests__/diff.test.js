import {diffReports, diffStats, normalizeMarkdownForDiff} from "../diff.js";
import assert from "node:assert/strict";
import {test} from "node:test";

test("diffStats reports warnings for values within tolerance", () => {
  const legacy = {
    issueCounter: 100,
    modulesWithImageCounter: 5,
    modulesWithIssuesCounter: 5,
    repositoryHoster: {github: 5},
    maintainer: {alice: 3, bob: 2}
  };

  const ts = {
    issueCounter: 101,
    modulesWithImageCounter: 6,
    modulesWithIssuesCounter: 6,
    repositoryHoster: {github: 6},
    maintainer: {alice: 4, bob: 2}
  };

  const diff = diffStats(legacy, ts);

  assert.equal(diff.hasDifferences, false);
  assert.equal(diff.hasWarnings, true);
  assert.equal(diff.numeric.differences.length, 0);
  assert.ok(diff.numeric.warnings.some((entry) => entry.key === "issueCounter"));
  assert.ok(diff.maps.warnings.some((entry) => entry.key === "repositoryHoster"));
});

test("diffStats surfaces differences when tolerance is exceeded", () => {
  const legacy = {issueCounter: 50, modulesWithImageCounter: 3};
  const ts = {issueCounter: 60, modulesWithImageCounter: 7};

  const diff = diffStats(legacy, ts);

  assert.equal(diff.hasDifferences, true);
  assert.ok(diff.numeric.differences.some((entry) => entry.key === "issueCounter"));
});

test("normalizeMarkdownForDiff removes volatile metadata", () => {
  const source = [
    "# Result",
    "Last update: 2025-10-02T18:15:13+02:00",
    "- Stable content"
  ].join("\n");

  const normalized = normalizeMarkdownForDiff(source);

  assert.equal(normalized.includes("Last update"), false);
  assert.ok(normalized.includes("Stable content"));
});

test("diffReports ignores Last update changes in result.md", () => {
  const markdownLegacy = [
    "# Result",
    "Last update: 2025-10-01T00:00:00Z",
    "- Stable content"
  ].join("\n");

  const markdownTs = [
    "# Result",
    "Last update: 2025-10-02T00:00:00Z",
    "- Stable content"
  ].join("\n");

  const reportDiff = diffReports({
    markdownLegacy,
    markdownTs,
    htmlLegacy: "<p>Hello</p>",
    htmlTs: "<p>Hello</p>"
  });

  assert.equal(reportDiff.hasDifferences, false);
  assert.equal(reportDiff.markdown.hasDifferences, false);
});

test("diffReports flags substantive Markdown differences", () => {
  const markdownLegacy = [
    "# Result",
    "- Stable content"
  ].join("\n");

  const markdownTs = [
    "# Result",
    "- Updated content"
  ].join("\n");

  const reportDiff = diffReports({
    markdownLegacy,
    markdownTs,
    htmlLegacy: "<p>Hello</p>",
    htmlTs: "<p>Hello</p>"
  });

  assert.equal(reportDiff.hasDifferences, true);
  assert.equal(reportDiff.markdown.hasDifferences, true);
  assert.ok(reportDiff.markdown.differences.length > 0);
});
