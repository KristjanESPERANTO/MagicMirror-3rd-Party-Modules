#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { validateStageFile } from "../lib/schemaValidator.ts";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type FixtureStageId = "modules.final" | "modules.min" | "stats";

interface FixtureDefinition {
  relativePath: string;
  stageId: FixtureStageId;
}

const FIXTURES: FixtureDefinition[] = [
  { stageId: "modules.final", relativePath: "fixtures/data/modules.json" },
  { stageId: "modules.min", relativePath: "fixtures/data/modules.min.json" },
  { stageId: "stats", relativePath: "fixtures/data/stats.json" }
];

function resolvePath(relativePath: string): string {
  return path.join(FIXTURE_ROOT, relativePath);
}

async function validateFixture(fixture: FixtureDefinition): Promise<string> {
  const absolutePath = resolvePath(fixture.relativePath);
  await validateStageFile(fixture.stageId, absolutePath);
  return absolutePath;
}

async function main() {
  const failures: Array<{ error: unknown; fixture: FixtureDefinition }> = [];

  for (const fixture of FIXTURES) {
    try {
      const absolutePath = await validateFixture(fixture);
      console.log(`✔ ${fixture.stageId} \u2192 ${path.relative(FIXTURE_ROOT, absolutePath)}`);
    }
    catch (error) {
      failures.push({ fixture, error });
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✖ ${fixture.stageId} failed: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nFixture validation failed for the stages above. See errors for details.");
    process.exit(1);
  }

  console.log("All fixture stages validated successfully.");
}

main();
