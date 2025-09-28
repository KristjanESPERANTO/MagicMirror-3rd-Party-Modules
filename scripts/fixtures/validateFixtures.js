#!/usr/bin/env node

import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";
import {validateStageFile} from "../lib/schemaValidator.js";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FIXTURES = [
  {stageId: "modules.stage.1", relativePath: "fixtures/data/modules.stage.1.json"},
  {stageId: "modules.stage.2", relativePath: "fixtures/data/modules.stage.2.json"},
  {stageId: "modules.stage.3", relativePath: "fixtures/data/modules.stage.3.json"},
  {stageId: "modules.stage.4", relativePath: "fixtures/data/modules.stage.4.json"},
  {stageId: "modules.stage.5", relativePath: "fixtures/data/modules.stage.5.json"}
];

function resolvePath (relativePath) {
  return path.join(FIXTURE_ROOT, relativePath);
}

async function validateFixture (fixture) {
  const absolutePath = resolvePath(fixture.relativePath);
  await validateStageFile(fixture.stageId, absolutePath);
  return absolutePath;
}

async function main () {
  const failures = [];

  for (const fixture of FIXTURES) {
    try {
      const absolutePath = await validateFixture(fixture);
      console.log(`✔ ${fixture.stageId} \u2192 ${path.relative(FIXTURE_ROOT, absolutePath)}`);
    } catch (error) {
      failures.push({fixture, error});
      console.error(`✖ ${fixture.stageId} failed: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nFixture validation failed for the stages above. See errors for details.");
    process.exit(1);
  }

  console.log("All fixture stages validated successfully.");
}

main();
