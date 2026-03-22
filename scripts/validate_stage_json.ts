#!/usr/bin/env node
import { cliValidateStage } from "./lib/schemaValidator.ts";
import process from "node:process";

type StageValidationId = "modules.stage.1" | "modules.stage.2" | "modules.stage.3" | "modules.stage.4" | "modules.final" | "modules.min" | "stats";

async function main() {
  const [stageId, filePath] = process.argv.slice(2);

  if (!stageId || !filePath) {
    console.error("Usage: node scripts/validate_stage_json.ts <stage-id> <file-path>");
    process.exit(1);
  }

  const exitCode = await cliValidateStage(stageId as StageValidationId, filePath);
  process.exit(exitCode);
}

main();
