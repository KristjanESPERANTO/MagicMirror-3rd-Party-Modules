import {
  MISSING_DEPENDENCY_RULE_ID,
  detectUsedDependencies,
  extractDeclaredDependencyNames,
  findMissingDependencies,
  shouldAnalyzeFileForDependencyUsage
} from "../dependency-usage.js";

import assert from "node:assert/strict";
import test from "node:test";

function toSortedArray (iterable) {
  return Array.from(iterable).sort((a, b) => a.localeCompare(b));
}

test("exports the shared rule id", () => {
  assert.equal(MISSING_DEPENDENCY_RULE_ID, "pkg-missing-dependency");
});

test("detects third-party dependency imports via require and import", () => {
  const sample = [
    "import dayjs from 'dayjs';",
    "const tz = require('moment-timezone/builds');",
    "await import('@scope/example/utils');",
    "const fetchImpl = await import('node-fetch');",
    "const express = require('express');"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(
    toSortedArray(detected),
    ["@scope/example", "dayjs", "moment-timezone", "node-fetch"]
  );
});

test("ignores relative and built-in dependencies", () => {
  const sample = [
    "const fs = require('fs');",
    "import path from 'node:path';",
    "const http = await import('node:http');",
    "import util from './util.js';",
    "const styles = require('../styles.css');",
    "const helper = require('node_helper');",
    "const logger = require('logger');"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(Array.from(detected), []);
});

test("ignores unrelated content", () => {
  const detected = detectUsedDependencies("const value = 42;");
  assert.deepEqual(Array.from(detected), []);
});

test("only analyzes supported source files", () => {
  assert.ok(shouldAnalyzeFileForDependencyUsage("node_helper.js"));
  assert.ok(shouldAnalyzeFileForDependencyUsage("src/helpers/util.ts"));
  assert.ok(!shouldAnalyzeFileForDependencyUsage("README.md"));
  assert.ok(!shouldAnalyzeFileForDependencyUsage("vendor/moment.min.js"));
  assert.ok(!shouldAnalyzeFileForDependencyUsage("examples/demo.js"));
});

test("extracts declared dependencies across sections", () => {
  const declared = extractDeclaredDependencyNames({
    dependencies: {
      moment: "^2.29.4",
      axios: "^1.7.0"
    },
    devDependencies: {
      eslint: "^9.0.0"
    },
    optionalDependencies: {
      express: "^4.18.2"
    },
    peerDependencies: {
      "socket.io": "^4.7.5"
    }
  });

  assert.deepEqual(toSortedArray(declared), ["axios", "eslint", "express", "moment", "socket.io"]);
});

test("finds missing dependencies", () => {
  const declared = new Set(["moment", "express"]);
  const missing = findMissingDependencies({
    declaredDependencies: declared,
    usedDependencies: new Set(["moment", "moment-timezone", "express"])
  });

  assert.deepEqual(missing, ["moment-timezone"]);
});

test("ignores dependencies in single-line comments", () => {
  const sample = [
    "import dayjs from 'dayjs';",
    "// import fake from 'fake-package';",
    "const real = require('real-package');",
    "// const commented = require('commented-package');"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(toSortedArray(detected), ["dayjs", "real-package"]);
});

test("ignores dependencies in multi-line comments", () => {
  const sample = [
    "import dayjs from 'dayjs';",
    "/*",
    " * import fake from 'fake-package';",
    " * const another = require('another-fake');",
    " */",
    "const real = require('real-package');"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(toSortedArray(detected), ["dayjs", "real-package"]);
});

test("ignores dependencies in inline comments", () => {
  const sample = [
    "import dayjs from 'dayjs';",
    "const obj = { cookieString: value }; // Changed from 'cookies' to 'cookieString'",
    "const real = require('real-package'); // using real-package here"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(toSortedArray(detected), ["dayjs", "real-package"]);
});

test("handles comments with 'from' keyword - real world case", () => {
  const sample = [
    "import something from 'real-import';",
    "// Match from defaults:  from \"{\" to the closing \"}\" before getStyles()",
    "const value = 42;"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(toSortedArray(detected), ["real-import"]);
});

test("preserves imports in strings", () => {
  const sample = [
    "import dayjs from 'dayjs';",
    "const docString = 'Use require to load';",
    "const message = `Import from packages is shown here`;"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(toSortedArray(detected), ["dayjs"]);
});

test("handles escaped quotes in strings", () => {
  const sample = [
    "import real from 'real-package';",
    "const str1 = 'It\\'s a test';",
    "const str2 = \"She said \\\"hello\\\"\";",
    "const str3 = `Template with \\`backticks\\``;"
  ].join("\n");

  const detected = detectUsedDependencies(sample);
  assert.deepEqual(toSortedArray(detected), ["real-package"]);
});
