#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const COMMANDS: Record<string, { script: string; args: string[] }> = {
  generate: { script: "scripts/fixtures/generateFixturePipeline.ts", args: [] },
  validate: { script: "scripts/fixtures/validateFixtures.ts", args: [] },
  "update-shas": { script: "scripts/fixtures/updateBaselineShas.ts", args: [] },
  "golden-check": { script: "scripts/golden-artifacts/index.ts", args: ["check"] },
  "golden-update": { script: "scripts/golden-artifacts/index.ts", args: ["update"] }
};

const command = process.argv[2];
const selected = command ? COMMANDS[command] : undefined;

if (!selected) {
  console.error(`Usage: node scripts/fixtures.ts <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [selected.script, ...selected.args], {
  cwd: process.cwd(),
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
