#!/usr/bin/env node

import process from "node:process";

console.error(
  [
    "scripts/expand_module_list_with_repo_data.ts is deprecated and no longer part of the supported pipeline.",
    "Use: node scripts/orchestrator/index.ts run full-refresh-parallel"
  ].join("\n")
);

process.exit(1);
