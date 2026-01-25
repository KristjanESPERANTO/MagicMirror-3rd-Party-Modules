#!/usr/bin/env node
import { cliValidateStage } from "./lib/schemaValidator.js";
import process from "node:process";

async function main() {
  const [stageId, filePath] = process.argv.slice(2);

  if (!stageId || !filePath) {
    console.error("Usage: node scripts/validate_stage_json.js <stage-id> <file-path>");
    process.exit(1);
  }

  const exitCode = await cliValidateStage(stageId, filePath);
  process.exit(exitCode);
}

main();
