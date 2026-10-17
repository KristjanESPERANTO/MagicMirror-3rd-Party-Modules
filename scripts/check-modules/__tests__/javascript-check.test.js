import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Linter } from "eslint";
import { analyzeModule } from "../module-analyzer.ts";
import assert from "node:assert/strict";
import eslintConfig from "../../../eslint.testconfig.js";
import { getRuleById } from "../rule-registry.ts";
import { join } from "node:path";
import { runEslintCheck } from "../../../pipeline/workers/process-module.ts";
import { test } from "node:test";
import { tmpdir } from "node:os";

const linter = new Linter();

function checkJavaScript(content, relativePath) {
  return linter.verify(content, eslintConfig, { filename: relativePath }).flatMap((message) => {
    const rule = message.ruleId?.startsWith("magicmirror/") && message.messageId ? getRuleById(message.messageId) : null;
    return rule ? [`${rule.category}: In \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`] : [];
  });
}

test("HTTP imports use the central config for imports, requires, re-exports and dynamic imports", () => {
  for (const packageName of ["node-fetch", "request", "request-promise", "native-request", "fetch", "axios"]) {
    for (const source of [
      `import client from '${packageName}';`,
      `const client = require ( '${packageName}' );`,
      `const client = import('${packageName}');`,
      `export { default } from '${packageName}';`,
      `export * from '${packageName}';`
    ]) {
      const issues = checkJavaScript(source, "src/client.js");
      assert.equal(issues.length, 1, source);
      assert.match(issues[0], /src\/client\.js:1:\d+/u);
      assert.ok(issues[0].includes(`${packageName}:`));
      assert.match(issues[0], packageName.startsWith("request") || packageName === "native-request" ? /^Deprecated:/u : /^Recommendation:/u);
    }
  }
});

test("HTTP imports ignore text mentions, unrelated packages and shadowed require", () => {
  for (const source of [
    "// require('request')\nconst axios = 'node-fetch';",
    "const example = \"require('request')\";",
    "import client from 'axios-extra';",
    "function load(require) { return require('axios'); }",
    "const require = () => null; require('request');"
  ]) {
    assert.deepEqual(checkJavaScript(source, "client.js"), [], source);
  }
  assert.deepEqual(checkJavaScript("require('request')", "README.md"), []);
  assert.deepEqual(checkJavaScript("{\"dependencies\":{\"axios\":\"*\"}}", "package.json"), []);
});

test("HTTP imports cover CommonJS, subpaths and ignore inline ESLint configuration", () => {
  assert.equal(checkJavaScript("const client = require('axios');", "client.cjs").length, 1);
  assert.equal(checkJavaScript("import 'axios/unsafe/core/Axios.js';", "client.mjs").length, 1);
  assert.equal(checkJavaScript("/* eslint-disable */\nrequire('node-fetch');", "client.js").length, 1);
});

test("Node protocol checks cover HTTP imports, requires, dynamic imports and re-exports", () => {
  for (const moduleName of ["http", "https"]) {
    for (const source of [
      `import client from '${moduleName}';`,
      `const client = require ( '${moduleName}' );`,
      `import('${moduleName}');`,
      `export { request } from '${moduleName}';`,
      `export * from '${moduleName}';`
    ]) {
      const issues = checkJavaScript(source, "client.js");
      assert.equal(issues.length, 1, source);
      assert.match(issues[0], /^Recommendation: In `client\.js:1:\d+`: /u);
      assert.ok(issues[0].includes(`node:${moduleName}`));
      assert.match(issues[0], /client\.js:1:\d+/u);
    }
    assert.equal(checkJavaScript(`require('${moduleName}');`, "client.cjs").length, 1);
  }
});

test("Node protocol checks ignore text, modern imports, unrelated modules and local require bindings", () => {
  for (const source of [
    "// require('http')\nconst example = \"require('https')\";",
    "require('node:http'); import('node:https');",
    "import client from 'node:http'; export * from 'node:https';",
    "require('http-proxy'); import('https-proxy-agent');",
    "import fs from 'fs'; require('path');",
    "function load(require) { return require('http'); }",
    "const require = () => null; require('https');"
  ]) {
    assert.deepEqual(checkJavaScript(source, "client.js"), [], source);
  }
  assert.deepEqual(checkJavaScript("require('http')", "README.md"), []);
  assert.equal(checkJavaScript("const require = () => null; import('http');", "client.js").length, 1);
});

test("Node protocol checks preserve the plugin autofix without changing unrelated imports", () => {
  const result = linter.verifyAndFix("import http from 'http'; const https = require('https'); import fs from 'fs';", eslintConfig, { filename: "client.js" });
  assert.equal(result.output, "import http from 'node:http'; const https = require('node:https'); import fs from 'fs';");
  assert.deepEqual(result.messages.filter(message => message.ruleId?.startsWith("magicmirror/")), []);
  assert.deepEqual(checkJavaScript(result.output, "client.js"), []);
});

test("worker ESLint reports Node protocol recommendations once and ignores README examples", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "node-protocol-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const codePath = join(root, "node_helper.js");
  const readmePath = join(root, "README.md");
  await writeFile(codePath, "require('http'); require('https');\n");
  await writeFile(readmePath, "require('http'); require('https');\n");
  const issues = await runEslintCheck(root, false);
  const protocolIssues = issues.filter(issue => issue.includes("scoped import"));
  assert.equal(protocolIssues.length, 2);
  assert.ok(protocolIssues.every(issue => /node_helper\.js:1:\d+/u.test(issue)));
});

test("deprecated Buffer checks resolve global, imported and aliased constructors", () => {
  for (const source of [
    "new Buffer ('value');",
    "import { Buffer as Bytes } from 'node:buffer'; new Bytes('value');",
    "const { Buffer: Bytes } = require('buffer'); new Bytes('value');",
    "const buffers = require('node:buffer'); new buffers.Buffer('value');",
    "const Bytes = Buffer; new Bytes('value');"
  ]) {
    const issues = checkJavaScript(source, "node_helper.js");
    assert.equal(issues.length, 1, source);
    assert.match(issues[0], /^Deprecated:.*new Buffer\(\)/u);
    assert.match(issues[0], /node_helper\.js:1:\d+/u);
  }
});

test("deprecated fs checks resolve imports, aliases and computed constant names", () => {
  for (const constant of ["F_OK", "R_OK", "W_OK", "X_OK"]) {
    for (const source of [
      `const fs = require('fs'); fs.${constant};`,
      `import filesystem from 'node:fs'; filesystem['${constant}'];`,
      `import * as filesystem from 'fs'; filesystem.${constant};`,
      `require('node:fs').${constant};`
    ]) {
      const issues = checkJavaScript(source, source.startsWith("import") ? "module.mjs" : "node_helper.cjs");
      assert.equal(issues.length, 1, source);
      assert.ok(issues[0].includes(`fs.constants.${constant}`));
    }
  }
});

test("deprecated getYear checks require a statically known Date instance", () => {
  for (const source of [
    "new Date().getYear();",
    "const date = new Date(); date.getYear ();",
    "const date = new Date(); const alias = date; alias['getYear']();",
    "const date = new Date(); date?.getYear?.();",
    "const Clock = Date; new Clock().getYear();"
  ]) {
    const issues = checkJavaScript(source, "module.js");
    assert.equal(issues.length, 1, source);
    assert.match(issues[0], /getFullYear/u);
  }
});

test("deprecated API checks ignore text, modern APIs and custom or reassigned bindings", () => {
  for (const source of [
    "// new Buffer('x'); fs.F_OK; date.getYear()\nconst example = 'getYear()';",
    "Buffer.from('value'); Buffer.alloc(3); new Date().getFullYear();",
    "const fs = require('fs'); fs.constants.F_OK;",
    "function custom(Buffer) { return new Buffer('value'); }",
    "const Buffer = class {}; new Buffer();",
    "function custom(fs) { return fs.F_OK; }",
    "const fs = { F_OK: 1 }; fs.F_OK;",
    "import fs from 'custom-fs'; fs.F_OK;",
    "function custom(require) { const fs = require('fs'); return fs.F_OK; }",
    "const custom = { getYear() {} }; custom.getYear();",
    "function custom(date) { return date.getYear(); }",
    "function custom(Date) { return new Date().getYear(); }",
    "let date = new Date(); date = {}; date.getYear();",
    "let fs = require('fs'); fs = {}; fs.F_OK;",
    "let Bytes = Buffer; Bytes = class {}; new Bytes();",
    "const fs = require('fs'); const property = 'F_OK'; fs[property];"
  ]) {
    assert.deepEqual(checkJavaScript(source, "module.js"), [], source);
  }
  assert.deepEqual(checkJavaScript("new Buffer('value');", "README.md"), []);
});

test("worker ESLint reports migrated APIs once and runs HTTP checks in the same pass", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "javascript-check-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const codePath = join(root, "node_helper.js");
  const readmePath = join(root, "README.md");
  await writeFile(codePath, "const fs = require('fs'); fs.F_OK; new Buffer('value'); new Date().getYear(); require('axios');\n");
  await writeFile(readmePath, "new Buffer('value'); fs.F_OK; date.getYear();\n");
  const analysis = await analyzeModule(root, "MMM-Test", "https://github.com/example/MMM-Test", [codePath, readmePath]);
  assert.equal(analysis.issues.some(issue => issue.includes("node_helper.js:")), false);
  const issues = await runEslintCheck(root, false);
  const deprecatedIssues = issues.filter(issue => issue.startsWith("Deprecated:"));
  assert.equal(deprecatedIssues.length, 3);
  assert.ok(deprecatedIssues.every(issue => /node_helper\.js:1:\d+/u.test(issue)));
  assert.equal(issues.filter(issue => issue.includes("axios:")).length, 1);
});

test("worker ESLint uses one trusted config for JavaScript and package.json without modifying files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "central-eslint-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = "/* eslint-disable */\nrequire('axios'); const unused = 1;\n";
  for (const filename of ["module.js", "helper.cjs", "library.mjs"]) {
    await writeFile(join(root, filename), source);
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "mmm-test", version: "1.0.0" }));
  await writeFile(join(root, "eslint.config.js"), "throw new Error('Foreign config must not execute');\n");
  await writeFile(join(root, "bundle.min.js"), "require('request');\n");
  await mkdir(join(root, "node_modules", "example"), { recursive: true });
  await writeFile(join(root, "node_modules", "example", "ignored.js"), "require('request');\n");
  for (const directory of ["vendor", "public/vendor"]) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, "checked.js"), "require('request'); const vendorOnlyUnused = 1;\n");
  }

  const issues = await runEslintCheck(root);
  assert.equal(issues.filter(issue => issue.includes("axios:")).length, 3);
  const vendorIssues = issues.filter(issue => issue.includes("request:"));
  assert.equal(vendorIssues.length, 2);
  assert.ok(vendorIssues.some(issue => issue.includes("In `vendor/checked.js:")));
  assert.ok(vendorIssues.some(issue => issue.includes("In `public/vendor/checked.js:")));
  const generalIssues = issues.filter(issue => issue.startsWith("ESLint issues:"));
  assert.equal(generalIssues.length, 1);
  assert.ok(generalIssues[0].includes("no-unused-vars"));
  assert.ok(generalIssues[0].includes("package-json/require-type"));
  assert.equal(generalIssues[0].match(/vendorOnlyUnused/gu)?.length, 2);

  const requiredOnly = await runEslintCheck(root, false);
  assert.equal(requiredOnly.length, 5);
  for (const filename of ["module.js", "helper.cjs", "library.mjs"]) {
    assert.equal(await readFile(join(root, filename), "utf8"), source);
  }
});

test("worker ESLint reports parsing failures even when general checks are disabled", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "eslint-parse-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await runEslintCheck(root), []);
  await writeFile(join(root, "broken.js"), "const = ;\n");
  const issues = await runEslintCheck(root, false);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /ESLint issues:.*\n.*broken\.js.*Parsing error/u);
});
