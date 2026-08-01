#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { validateArtifactSet, type ArtifactDefinition } from "../lib/validate-artifacts.ts";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FIXTURES: ArtifactDefinition[] = [
  { stageId: "modules.final", relativePath: "fixtures/data/modules.json" },
  { stageId: "modules.min", relativePath: "fixtures/data/modules.min.json" },
  { stageId: "stats", relativePath: "fixtures/data/stats.json" }
];

async function main() {
  const valid = await validateArtifactSet({
    artifacts: FIXTURES,
    failureMessage: "Fixture validation failed for the stages above. See errors for details.",
    projectRoot: FIXTURE_ROOT,
    successMessage: "All fixture stages validated successfully."
  });

  if (!valid) {
    process.exit(1);
  }
}

main();
