#!/usr/bin/env node

import process from "node:process";

console.error(
  [
    "scripts/check-modules/index.ts legacy entrypoint is deprecated.",
    "Deep checks now run via the canonical orchestrator pipeline.",
    "Use: node scripts/orchestrator/index.ts run full-refresh-parallel"
  ].join("\n")
);

process.exit(1);
