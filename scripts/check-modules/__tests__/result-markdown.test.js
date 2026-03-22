import { buildResultMarkdown, collectIssueSummaries } from "../result-markdown.ts";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("result-markdown", () => {
  it("collects issue summaries from stage-5 modules", () => {
    const summaries = collectIssueSummaries([
      {
        name: "MMM-Example",
        maintainer: "Alice",
        url: "https://github.com/example/MMM-Example",
        issues: ["Issue one", "Issue two"]
      },
      {
        name: "MMM-Clean",
        maintainer: "Bob",
        issues: []
      },
      {
        name: "MMM-Boolean",
        maintainer: "Carol",
        issues: true
      }
    ]);

    assert.deepStrictEqual(summaries, [
      {
        name: "MMM-Example",
        maintainer: "Alice",
        url: "https://github.com/example/MMM-Example",
        issues: ["Issue one", "Issue two"]
      }
    ]);
  });

  it("renders markdown with stats timestamp and issue details", () => {
    const markdown = buildResultMarkdown(
      {
        issueCounter: 2,
        lastUpdate: "2026-03-22T05:08:24.251Z",
        maintainer: { Alice: 1 },
        moduleCounter: 1,
        modulesWithIssuesCounter: 1,
        repositoryHoster: { github: 1 }
      },
      [
        {
          name: "MMM-Example",
          maintainer: "Alice",
          url: "https://github.com/example/MMM-Example",
          issues: ["Issue one", "Issue two"]
        }
      ]
    );

    assert.ok(markdown.includes("Last update: 2026-03-22T05:08:24.251Z"));
    assert.ok(markdown.includes("### [MMM-Example by Alice](https://github.com/example/MMM-Example)"));
    assert.ok(markdown.includes("1. Issue one"));
    assert.ok(markdown.includes("2. Issue two"));
  });
});
