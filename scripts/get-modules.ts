#!/usr/bin/env node

import process from "node:process";

console.error(
  [
    "scripts/get-modules.ts is deprecated and no longer part of the supported pipeline.",
    "Use: node scripts/orchestrator/index.ts run full-refresh-parallel"
  ].join("\n")
);

process.exit(1);
