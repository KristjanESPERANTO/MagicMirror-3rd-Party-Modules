import { describe, it } from "node:test";
import assert from "node:assert";
import { parseModuleList } from "../parser.js";

describe("collect-metadata/parser", () => {
  it("should parse a valid wiki markdown table", () => {
    const markdown = `
### Finance
| [MMM-Finance](https://github.com/user/MMM-Finance) | [User](https://github.com/user) | Stock ticker |
`;
    const { modules, issues } = parseModuleList(markdown);

    assert.strictEqual(modules.length, 1);
    assert.strictEqual(issues.length, 0);
    assert.deepStrictEqual(modules[0], {
      name: "MMM-Finance",
      url: "https://github.com/user/MMM-Finance",
      id: "user/MMM-Finance",
      description: "Stock ticker",
      maintainer: "User",
      maintainerURL: "https://github.com/user",
      category: "Finance",
      issues: []
    });
  });

  it("should handle multiple categories", () => {
    const markdown = `
### Category A
| [ModA](https://github.com/u/ModA) | MaintA | Desc A |
### Category B
| [ModB](https://github.com/u/ModB) | MaintB | Desc B |
`;
    const { modules } = parseModuleList(markdown);
    assert.strictEqual(modules.length, 2);
    assert.strictEqual(modules[0].category, "Category A");
    assert.strictEqual(modules[1].category, "Category B");
  });

  it("should skip lines without valid repo links", () => {
    const markdown = `
### Test
| [Invalid](https://google.com) | Maint | Not a repo |
`;
    const { modules, issues } = parseModuleList(markdown);
    assert.strictEqual(modules.length, 0);
    assert.strictEqual(issues.length, 0); // Google.com doesn't match repo patterns, so line is ignored
  });
});
