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
