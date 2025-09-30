import {constants, promises as fsPromises} from "node:fs";
import {dirname} from "node:path";
import {ensureDirectory} from "./fs-utils.js";
import {execFile} from "node:child_process";
import process from "node:process";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

export class GitError extends Error {
  constructor (message, {args, cwd, exitCode, stderr, stdout, signal, cause} = {}) {
    super(message);
    this.name = "GitError";
    this.args = args;
    this.cwd = cwd;
    this.exitCode = exitCode ?? null;
    this.stderr = stderr ?? null;
    this.stdout = stdout ?? null;
    this.signal = signal ?? null;
    this.cause = cause ?? null;
  }
}

function normalizeArgs (args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("git command requires a non-empty array of arguments");
  }

  return args.map((entry) => String(entry));
}

function baseOptions (options = {}) {
  const {
    cwd,
    env = process.env,
    timeout = DEFAULT_TIMEOUT_MS,
    maxBuffer = DEFAULT_MAX_BUFFER,
    signal,
    input
  } = options;

  return {
    cwd,
    env,
    timeout,
    maxBuffer,
    encoding: "utf8",
    signal,
    input
  };
}

function formatErrorMessage (args, error) {
  const command = ["git", ...args].join(" ");
  const stderr = error?.stderr ? `\n${error.stderr.trim()}` : "";
  const suffix = error?.code ? ` (exit code ${error.code})` : "";
  const signalInfo = error?.signal ? ` (signal ${error.signal})` : "";

  return `git command failed${suffix}${signalInfo}: ${command}${stderr}`;
}

export async function git (args, options = {}) {
  const normalizedArgs = normalizeArgs(args);
  const execOptions = baseOptions(options);

  try {
    const {stdout, stderr} = await execFileAsync("git", normalizedArgs, execOptions);
    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd()
    };
  } catch (error) {
    if (error instanceof Error) {
      const message = formatErrorMessage(normalizedArgs, error);
      throw new GitError(message, {
        args: normalizedArgs,
        cwd: execOptions.cwd,
        exitCode: error.code,
        signal: error.signal,
        stderr: error.stderr,
        stdout: error.stdout,
        cause: error
      });
    }

    throw error;
  }
}

async function pathExists (targetPath) {
  try {
    await fsPromises.access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isGitRepository (directoryPath) {
  try {
    const {stdout} = await git(["rev-parse", "--is-inside-work-tree"], {cwd: directoryPath});
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function cloneRepository (repositoryUrl, destinationPath, {
  branch,
  depth = 0,
  singleBranch = Boolean(branch),
  extraArgs = []
} = {}) {
  await ensureDirectory(dirname(destinationPath));

  if (await pathExists(destinationPath)) {
    throw new Error(`Destination path already exists: ${destinationPath}`);
  }

  const args = ["clone", repositoryUrl, destinationPath, "--no-tags"];

  if (branch) {
    args.push("--branch", branch);
  }

  if (singleBranch) {
    args.push("--single-branch");
  }

  if (depth > 0) {
    args.push("--depth", String(depth));
  }

  if (Array.isArray(extraArgs) && extraArgs.length > 0) {
    args.push(...extraArgs.map((value) => String(value)));
  }

  await git(args);
  return destinationPath;
}

export async function fetchRepository ({cwd, remote = "origin", refspecs = [], depth = 0, prune = true} = {}) {
  const args = ["fetch", remote];

  if (depth > 0) {
    args.push("--depth", String(depth));
  }

  if (prune) {
    args.push("--prune");
  }

  if (Array.isArray(refspecs) && refspecs.length > 0) {
    args.push(...refspecs);
  }

  await git(args, {cwd});
}

export async function checkoutRef ({cwd, ref, create = false, force = false} = {}) {
  if (!ref) {
    throw new Error("checkoutRef requires a ref argument");
  }

  const args = ["checkout"];

  if (create) {
    args.push("-B");
  }

  if (force) {
    args.push("--force");
  }

  args.push(ref);

  await git(args, {cwd});
}

export async function getCurrentCommit ({cwd, ref = "HEAD"} = {}) {
  const {stdout} = await git(["rev-parse", ref], {cwd});
  return stdout.trim();
}

export async function listRemoteRefs ({remoteUrl, heads = true, tags = false, pattern} = {}) {
  const args = ["ls-remote", remoteUrl];

  if (heads) {
    args.push("--heads");
  }

  if (tags) {
    args.push("--tags");
  }

  if (pattern) {
    args.push(pattern);
  }

  const {stdout} = await git(args);
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [hash, ref] = line.split(/\s+/u);
    return {hash, ref};
  });
}

export async function ensureRepository ({repositoryUrl, directoryPath, branch = "origin/HEAD", depth = 0} = {}) {
  const exists = await pathExists(directoryPath);

  if (!exists) {
    await cloneRepository(repositoryUrl, directoryPath, {depth});
    return {
      cloned: true,
      updated: false,
      commit: await getCurrentCommit({cwd: directoryPath})
    };
  }

  if (!await isGitRepository(directoryPath)) {
    throw new Error(`Existing path is not a git repository: ${directoryPath}`);
  }

  await fetchRepository({cwd: directoryPath, depth});
  await checkoutRef({cwd: directoryPath, ref: branch, force: true});
  const commit = await getCurrentCommit({cwd: directoryPath});

  return {
    cloned: false,
    updated: true,
    commit
  };
}
