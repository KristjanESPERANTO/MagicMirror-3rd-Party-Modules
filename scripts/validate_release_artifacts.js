#!/usr/bin/env node

import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";
import {validateStageFile} from "./lib/schemaValidator.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RELEASE_ARTIFACTS = [
  // Note: modules.stage.1.json no longer exists - Stage 1+2 were unified into collect-metadata
  {stageId: "modules.stage.2", relativePath: "website/data/modules.stage.2.json"},
  {stageId: "modules.stage.3", relativePath: "website/data/modules.stage.3.json"},
  {stageId: "modules.stage.4", relativePath: "website/data/modules.stage.4.json"},
  {stageId: "modules.stage.5", relativePath: "website/data/modules.stage.5.json"},
  {stageId: "modules.final", relativePath: "website/data/modules.json"},
  {stageId: "modules.min", relativePath: "website/data/modules.min.json"},
  {stageId: "stats", relativePath: "website/data/stats.json"}
];

function resolvePath (relativePath) {
  return path.join(PROJECT_ROOT, relativePath);
}

async function validateArtifact ({stageId, relativePath}) {
  const absolutePath = resolvePath(relativePath);
  await validateStageFile(stageId, absolutePath);
  return absolutePath;
}

async function main () {
  const failures = [];

  for (const artifact of RELEASE_ARTIFACTS) {
    try {
      const absolutePath = await validateArtifact(artifact);
      console.log(`✔ ${artifact.stageId} → ${path.relative(PROJECT_ROOT, absolutePath)}`);
    } catch (error) {
      failures.push({artifact, error});
      console.error(`✖ ${artifact.stageId} failed: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nRelease artifact validation failed. Inspect the errors above and address the offending files before publishing a new package.");
    process.exit(1);
  }

  console.log("All release artifacts validated successfully.");
}

main();
