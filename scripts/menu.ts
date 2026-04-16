#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

interface PackageScripts {
  [key: string]: string;
}

interface PackageJson {
  menu?: {
    descriptions?: Record<string, string>;
  };
  scripts?: PackageScripts;
}

interface ScriptEntry {
  description: string;
  name: string;
}

interface AbortErrorLike {
  code?: string;
}

async function loadPackageJson(): Promise<PackageJson> {
  const currentFile = fileURLToPath(import.meta.url);
  const packageJsonPath = path.resolve(path.dirname(currentFile), "..", "package.json");
  const content = await readFile(packageJsonPath, "utf8");
  return JSON.parse(content) as PackageJson;
}

function buildScriptEntries(pkg: PackageJson): ScriptEntry[] {
  const scripts = pkg.scripts ?? {};
  const descriptions = pkg.menu?.descriptions ?? {};

  return Object.keys(scripts)
    .filter(scriptName => scriptName !== "start" && scriptName !== "leaveMenu")
    .map(name => ({
      name,
      description: descriptions[name] ?? ""
    }));
}

async function runScript(scriptName: string): Promise<number> {
  return await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, ["--run", scriptName], {
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function renderMenu(entries: ScriptEntry[]): void {
  console.log("\n⬢  Node Task List");
  console.log("");

  const terminalWidth = process.stdout.columns ?? 120;
  const indexWidth = 4;
  const maxScriptNameLength = entries.reduce((max, entry) => Math.max(max, entry.name.length), 0);
  const scriptWidth = Math.max(14, Math.min(maxScriptNameLength + 2, Math.floor(terminalWidth * 0.45)));
  const descriptionWidth = Math.max(20, terminalWidth - indexWidth - scriptWidth - 7);

  const header = `${"No.".padEnd(indexWidth)} | ${"Script".padEnd(scriptWidth)} | Description`;
  const separator = `${"-".repeat(indexWidth)}-+-${"-".repeat(scriptWidth)}-+-${"-".repeat(descriptionWidth)}`;

  console.log(header);
  console.log(separator);

  for (const [index, entry] of entries.entries()) {
    const number = String(index + 1).padStart(2, " ").padEnd(indexWidth);
    const script = truncate(entry.name, scriptWidth).padEnd(scriptWidth);
    const description = truncate(entry.description || "-", descriptionWidth);
    console.log(`${number} | ${script} | ${description}`);
  }

  console.log("\nSelect by number or script name (Ctrl+C to quit)");
}

async function main(): Promise<number> {
  const packageJson = await loadPackageJson();
  const entries = buildScriptEntries(packageJson);

  if (entries.length === 0) {
    console.error("No npm scripts available.");
    return 1;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("Interactive menu requires a TTY. Available scripts:");
    for (const entry of entries) {
      console.log(`- ${entry.name}`);
    }
    console.log("\nRun one directly with: node --run <script>");
    return 0;
  }

  const entryByName = new Map(entries.map(entry => [entry.name.toLowerCase(), entry]));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      renderMenu(entries);
      let input: string;
      try {
        input = (await rl.question("\nChoice: ")).trim();
      }
      catch (error) {
        const abortError = error as AbortErrorLike;
        if (abortError.code === "ABORT_ERR") {
          console.log("");
          return 0;
        }
        throw error;
      }

      const normalized = input.toLowerCase();

      const selectedIndex = Number.parseInt(normalized, 10);
      let selected: ScriptEntry | undefined;

      if (!Number.isNaN(selectedIndex)) {
        selected = entries[selectedIndex - 1];
      }
      else {
        selected = entryByName.get(normalized);
      }

      if (!selected) {
        console.log("Invalid choice. Use number, script name, or Ctrl+C to quit.");
        continue;
      }

      console.log(`\nRunning '${selected.name}'...\n`);
      const exitCode = await runScript(selected.name);

      if (exitCode !== 0) {
        console.log(`\nScript '${selected.name}' exited with code ${exitCode}.`);
      }
    }
  }
  finally {
    rl.close();
  }
}

process.exitCode = await main();
