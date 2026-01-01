import {describe, it} from "node:test";
import assert from "node:assert";
import {parseModuleList} from "../parser.js";

describe("collect-metadata/parser", () => {
  it("should parse a valid wiki markdown table", () => {
    const markdown = `
### Finance
| Name | Description | Author |
| --- | --- | --- |
| [MMM-Finance](https://github.com/user/MMM-Finance) | Stock ticker | [User](https://github.com/user) |
`;
    const {modules, issues} = parseModuleList(markdown);

    assert.strictEqual(modules.length, 1);
    assert.strictEqual(issues.length, 0);
    assert.deepStrictEqual(modules[0], {
      name: "MMM-Finance",
      url: "https://github.com/user/MMM-Finance",
      description: "Stock ticker",
      maintainer: "[User](https://github.com/user)",
      category: "Finance",
      source: "wiki"
    });
  });

  it("should handle multiple categories", () => {
    const markdown = `
### Category A
| [ModA](https://github.com/u/ModA) | Desc A |
### Category B
| [ModB](https://github.com/u/ModB) | Desc B |
`;
    const {modules} = parseModuleList(markdown);
    assert.strictEqual(modules.length, 2);
    assert.strictEqual(modules[0].category, "Category A");
    assert.strictEqual(modules[1].category, "Category B");
  });

  it("should skip lines without valid repo links", () => {
    const markdown = `
### Test
| Name | Desc |
| [Invalid](https://google.com) | Not a repo |
`;
    const {modules, issues} = parseModuleList(markdown);
    assert.strictEqual(modules.length, 0);
    assert.strictEqual(issues.length, 0); // Just skipped, not an error unless it looks like a repo
  });
});
