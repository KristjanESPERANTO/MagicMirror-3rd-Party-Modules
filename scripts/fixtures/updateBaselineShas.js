#!/usr/bin/env node

import {execSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FILE_URL = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(FILE_URL), "..", "..");

const FIXTURES = [
  {
    slug: "baseline-mmm-airquality",
    repo: "CFenner/MMM-AirQuality",
    lastCommit: "2025-05-18T02:41:28Z"
  },
  {
    slug: "baseline-mmm-admin-interface",
    repo: "ItayXD/MMM-Admin-Interface",
    lastCommit: "2018-07-08T01:07:24+03:00"
  },
  {
    slug: "baseline-mmm-actual",
    repo: "trumpetx/MMM-Actual",
    lastCommit: "2025-05-01T07:33:34-05:00"
  }
];

function info (message) {
  process.stderr.write(`${message}\n`);
}

function fetchRemoteHead (repo) {
  const remote = `https://github.com/${repo}.git`;
  info(`Fetching HEAD for ${repo}…`);
  const output = execSync(`git ls-remote ${remote} HEAD`, {
    cwd: ROOT_DIR,
    encoding: "utf8"
  });
  const line = output.trim();
  if (!line) {
    throw new Error(`No ls-remote output for ${repo}`);
  }
  const [sha] = line.split(/\s+/u);
  if (!sha || sha.length !== 40) {
    throw new Error(`Unexpected ls-remote response for ${repo}: ${line}`);
  }
  return sha;
}

function updateFixtureFile ({slug, repo, lastCommit}, sha) {
  const fixturePath = path.join(ROOT_DIR, "fixtures", "modules", slug, "FIXTURE.md");
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Missing fixture file for ${slug}`);
  }
  const raw = fs.readFileSync(fixturePath, "utf8");

  const snapshotLine = `- Snapshot reference: Stage 5 dataset as of 2025-09-28 (\`lastCommit\`: ${lastCommit})`;
  const updated = raw
    .replace(/- Snapshot reference:.*\n/u, `${snapshotLine}\n`)
    .replace(/- Upstream commit SHA:.*\n/u, `- Upstream commit SHA: \`${sha}\` (HEAD at update time for ${repo})\n`);

  fs.writeFileSync(fixturePath, updated, "utf8");
  info(`Updated ${slug} -> ${sha}`);
}

function main () {
  let failures = 0;

  for (const fixture of FIXTURES) {
    try {
      const sha = fetchRemoteHead(fixture.repo);
      updateFixtureFile(fixture, sha);
    } catch (error) {
      failures += 1;
      info(`Failed to update ${fixture.slug}: ${error.message}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    info(`Completed with ${failures} failure(s).`);
  } else {
    info("All fixtures updated successfully.");
  }
}

main();
