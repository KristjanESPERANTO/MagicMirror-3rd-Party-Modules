#!/usr/bin/env node

import {mkdir, readFile, writeFile} from "node:fs/promises";
import RefParser from "@apidevtools/json-schema-ref-parser";
import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(currentDir, "src");
const DIST_DIR = path.resolve(currentDir, "../../dist/schemas");

const SCHEMA_FILES = [
  "modules.stage.1.schema.json",
  "modules.stage.2.schema.json",
  "modules.stage.3.schema.json",
  "modules.stage.4.schema.json",
  "modules.stage.5.schema.json",
  "modules.final.schema.json",
  "modules.min.schema.json",
  "stats.schema.json"
];

const CHECK_MODE = process.argv.includes("--check");

async function ensureDistDir () {
  if (CHECK_MODE) {
    return;
  }

  await mkdir(DIST_DIR, {recursive: true});
}

async function bundleSchema (filename) {
  const sourcePath = path.join(SRC_DIR, filename);
  const bundledSchema = await RefParser.dereference(sourcePath, {
    dereference: {circular: false}
  });
  const output = `${JSON.stringify(bundledSchema, null, 2)}\n`;
  return {sourcePath, output};
}

async function fileExists (filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function writeBundledSchema (filename, output) {
  const targetPath = path.join(DIST_DIR, filename);

  if (CHECK_MODE) {
    const exists = await fileExists(targetPath);

    if (!exists) {
      return {filename, matches: false};
    }

    const current = await readFile(targetPath, "utf8");
    return {filename, matches: current === output};
  }

  await writeFile(targetPath, output, "utf8");
  return {filename, matches: true};
}

async function main () {
  await ensureDistDir();

  const mismatches = [];

  for (const filename of SCHEMA_FILES) {
    const {output} = await bundleSchema(filename);
    const result = await writeBundledSchema(filename, output);

    if (!CHECK_MODE) {
      console.log(`Bundled ${filename}`);
    } else if (!result.matches) {
      mismatches.push(filename);
    }
  }

  if (CHECK_MODE) {
    if (mismatches.length > 0) {
      console.error("Schema bundle check failed. Run `npm run schemas:build` to regenerate:");
      mismatches.forEach((filename) => console.error(` - ${filename}`));
      process.exit(1);
    }

    console.log("Schema bundle check passed.");
  } else {
    console.log(`Schemas written to ${path.relative(process.cwd(), DIST_DIR)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
