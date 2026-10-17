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

test("package checks ignore dependency names and commands in unrelated metadata", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "eslint-package-metadata-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packagePath = join(root, "package.json");
  await writeFile(packagePath, JSON.stringify({
    name: "grunt",
    description: "eslint-config-airbnb husky install rollup-plugin-banner stylelint-config-prettier",
    keywords: ["needle", "electron-rebuild", "eslint-plugin-json", "eslint-plugin-jsonc"]
  }));
  const analysis = await analyzeModule(root, "MMM-Test", "https://github.com/example/MMM-Test", [packagePath]);
  for (const ruleId of [
    "pkg-deprecated-electron-rebuild",
    "pkg-deprecated-eslint-config-airbnb",
    "pkg-recommend-eslint-plugin-json",
    "pkg-deprecated-grunt",
    "pkg-outdated-husky-install",
    "pkg-recommend-needle",
    "pkg-deprecated-rollup-banner",
    "pkg-deprecated-stylelint-config-prettier"
  ]) {
    assert.equal(analysis.issues.some(issue => issue.includes(getRuleById(ruleId).description)), false, ruleId);
  }
  assert.deepEqual(await runEslintCheck(root, false), []);
});

test("structured package checks cover dependency declarations without duplicate generic recommendations", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "analyzer-package-dependencies-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packagePath = join(root, "package.json");
  const expectedRules = new Map([
    ["electron-rebuild", "pkg-deprecated-electron-rebuild"],
    ["eslint-config-airbnb", "pkg-deprecated-eslint-config-airbnb"],
    ["eslint-config-airbnb-base", "pkg-deprecated-eslint-config-airbnb"],
    ["eslint-config-airbnb-typescript", "pkg-deprecated-eslint-config-airbnb"],
    ["eslint-config-airbnb-typescript-base", "pkg-deprecated-eslint-config-airbnb"],
    ["eslint-plugin-json", "pkg-recommend-eslint-plugin-json"],
    ["eslint-plugin-jsonc", "pkg-recommend-eslint-plugin-json"],
    ["grunt", "pkg-deprecated-grunt"],
    ["needle", "pkg-recommend-needle"],
    ["rollup-plugin-banner", "pkg-deprecated-rollup-banner"],
    ["rollup-plugin-banner2", "pkg-deprecated-rollup-banner"],
    ["stylelint-config-prettier", "pkg-deprecated-stylelint-config-prettier"],
    ["stylelint-config-prettier-scss", "pkg-deprecated-stylelint-config-prettier"]
  ]);
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    await writeFile(packagePath, JSON.stringify({
      name: "mmm-test",
      version: "1.0.0",
      type: "module",
      [section]: Object.fromEntries(Array.from(expectedRules.keys(), name => [name, "^1.0.0"]))
    }, null, 2));
    const analysis = await analyzeModule(root, "MMM-Test", "https://github.com/example/MMM-Test", [packagePath]);
    const packageIssues = analysis.issues.filter(issue => issue.includes("In `package.json`:"));
    assert.equal(packageIssues.length, expectedRules.size, section);
    for (const [name, ruleId] of expectedRules) {
      const matching = packageIssues.filter(issue => issue.includes(`\`${name}\`:`));
      assert.equal(matching.length, 1, `${section}.${name}`);
      assert.ok(matching[0].startsWith(`${getRuleById(ruleId).category}: In \`package.json\`:`));
      assert.ok(matching[0].includes(getRuleById(ruleId).description));
    }
    assert.deepEqual(await runEslintCheck(root, false), []);
  }
  await writeFile(packagePath, JSON.stringify({ name: "mmm-test", version: "1.0.0", dependencies: { axios: "^1.0.0", needle: "^3.0.0" } }));
  const generalIssues = await runEslintCheck(root);
  assert.ok(generalIssues.some(issue => issue.includes("depend/ban-dependencies") && issue.includes("axios")));
  assert.equal(generalIssues.some(issue => issue.includes("depend/ban-dependencies") && issue.includes("needle")), false);
});

test("structured package checks inspect script values rather than script names or nested metadata", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "analyzer-package-scripts-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packagePath = join(root, "package.json");
  for (const command of ["husky install", "npx husky install", "husky   install .husky", "test && husky install"]) {
    await writeFile(packagePath, JSON.stringify({ scripts: { prepare: command } }));
    const analysis = await analyzeModule(root, "MMM-Test", "https://github.com/example/MMM-Test", [packagePath]);
    assert.equal(analysis.issues.filter(issue => issue.includes(getRuleById("pkg-outdated-husky-install").description)).length, 1, command);
  }
  await writeFile(packagePath, JSON.stringify({
    scripts: { "husky install": "husky", test: "husky installer", build: ["my", "husky install"].join("") },
    customConfig: { dependencies: { grunt: "^1.0.0" }, scripts: { prepare: "husky install" } }
  }));
  const analysis = await analyzeModule(root, "MMM-Test", "https://github.com/example/MMM-Test", [packagePath]);
  assert.equal(analysis.issues.some(issue => issue.includes(getRuleById("pkg-outdated-husky-install").description)), false);
  assert.equal(analysis.issues.some(issue => issue.includes(getRuleById("pkg-deprecated-grunt").description)), false);
});

test("worker separates structured package recommendations from general ESLint findings", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "eslint-package-worker-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packagePath = join(root, "package.json");
  const source = JSON.stringify({ name: "mmm-test", version: "1.0.0", dependencies: { needle: "^3.0.0" }, scripts: { prepare: "husky install" } });
  await writeFile(packagePath, source);
  const analysis = await analyzeModule(root, "MMM-Test", "https://github.com/example/MMM-Test", [packagePath]);
  assert.equal(analysis.issues.filter(issue => issue.includes(getRuleById("pkg-recommend-needle").description)).length, 1);
  assert.equal(analysis.issues.filter(issue => issue.includes(getRuleById("pkg-outdated-husky-install").description)).length, 1);
  const eslintIssues = await runEslintCheck(root, false);
  assert.deepEqual(eslintIssues, []);
  const generalIssues = await runEslintCheck(root);
  assert.equal(generalIssues.some(issue => issue.includes("depend/ban-dependencies")), false);
  assert.equal(await readFile(packagePath, "utf8"), source);
});

test("worker ESLint reports invalid package JSON without aborting JavaScript checks", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "eslint-invalid-package-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = "require('axios');\n";
  await writeFile(join(root, "helper.cjs"), source);
  for (const packageSource of [
    "{\"keywords\":[\"magicmirror\",]}",
    "{\"author\":{\"name\":\"Example\",}}",
    "{\"name\": /* comment */ \"example\"}",
    "{name:\"example\"}"
  ]) {
    await writeFile(join(root, "package.json"), packageSource);
    for (const includeGeneralChecks of [true, false]) {
      const issues = await runEslintCheck(root, includeGeneralChecks);
      assert.equal(issues.length, 2);
      assert.equal(issues.filter(issue => issue.includes("axios:")).length, 1);
      assert.ok(issues.some(issue => /package\.json.*Parsing error/u.test(issue)));
    }
    assert.equal(await readFile(join(root, "package.json"), "utf8"), packageSource);
  }
  assert.equal(await readFile(join(root, "helper.cjs"), "utf8"), source);
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
