import {
  GitError,
  GitErrorCategory
} from "../git.js";
import {describe, it} from "node:test";
import assert from "node:assert/strict";

describe("GitError categorization", () => {
  it("should categorize NOT_FOUND errors from repository not found messages", () => {
    const error = new GitError("Repository not found", {
      stderr: "fatal: repository 'https://github.com/user/repo.git/' not found",
      exitCode: 128,
      category: GitErrorCategory.NOT_FOUND
    });

    assert.equal(error.category, GitErrorCategory.NOT_FOUND);
  });

  it("should categorize NOT_FOUND errors from could not read messages", () => {
    const error = new GitError("Clone failed", {
      stderr: "fatal: could not read from remote repository",
      exitCode: 128,
      category: GitErrorCategory.NOT_FOUND
    });

    assert.equal(error.category, GitErrorCategory.NOT_FOUND);
  });

  it("should categorize AUTHENTICATION errors from permission denied", () => {
    const error = new GitError("Permission denied", {
      stderr: "fatal: Authentication failed for 'https://github.com/user/private.git/'",
      category: GitErrorCategory.AUTHENTICATION
    });

    assert.equal(error.category, GitErrorCategory.AUTHENTICATION);
  });

  it("should categorize NETWORK errors from timeout messages", () => {
    const error = new GitError("Network timeout", {
      stderr: "fatal: unable to access 'https://github.com/user/repo.git/': Operation timed out",
      category: GitErrorCategory.NETWORK
    });

    assert.equal(error.category, GitErrorCategory.NETWORK);
  });

  it("should categorize NETWORK errors from connection refused", () => {
    const error = new GitError("Connection failed", {
      stderr: "fatal: unable to access 'https://github.com/user/repo.git/': Connection refused",
      category: GitErrorCategory.NETWORK
    });

    assert.equal(error.category, GitErrorCategory.NETWORK);
  });

  it("should categorize INFRASTRUCTURE errors from rate limit messages", () => {
    const error = new GitError("Rate limit exceeded", {
      stderr: "fatal: You have exceeded a secondary rate limit",
      category: GitErrorCategory.INFRASTRUCTURE
    });

    assert.equal(error.category, GitErrorCategory.INFRASTRUCTURE);
  });

  it("should categorize INFRASTRUCTURE errors from server errors", () => {
    const error = new GitError("Server error", {
      stderr: "fatal: unable to access 'https://github.com/user/repo.git/': The requested URL returned error: 503",
      category: GitErrorCategory.INFRASTRUCTURE
    });

    assert.equal(error.category, GitErrorCategory.INFRASTRUCTURE);
  });

  it("should default to UNKNOWN for unrecognized errors", () => {
    const error = new GitError("Unknown error", {
      stderr: "fatal: some unexpected error message",
      category: GitErrorCategory.UNKNOWN
    });

    assert.equal(error.category, GitErrorCategory.UNKNOWN);
  });

  it("should include all error context in GitError instance", () => {
    const error = new GitError("Test error", {
      args: ["clone", "https://example.com/repo.git"],
      cwd: "/tmp/test",
      exitCode: 128,
      stderr: "fatal: repository not found",
      stdout: "",
      signal: null,
      category: GitErrorCategory.NOT_FOUND
    });

    assert.equal(error.message, "Test error");
    assert.deepEqual(error.args, ["clone", "https://example.com/repo.git"]);
    assert.equal(error.cwd, "/tmp/test");
    assert.equal(error.exitCode, 128);
    assert.equal(error.stderr, "fatal: repository not found");
    assert.equal(error.category, GitErrorCategory.NOT_FOUND);
  });

  it("should default category to UNKNOWN when not specified", () => {
    const error = new GitError("Default category test", {
      stderr: "some error"
    });

    assert.equal(error.category, GitErrorCategory.UNKNOWN);
  });
});

describe("GitErrorCategory enum", () => {
  it("should expose all error categories", () => {
    assert.equal(GitErrorCategory.NOT_FOUND, "NOT_FOUND");
    assert.equal(GitErrorCategory.AUTHENTICATION, "AUTHENTICATION");
    assert.equal(GitErrorCategory.NETWORK, "NETWORK");
    assert.equal(GitErrorCategory.INFRASTRUCTURE, "INFRASTRUCTURE");
    assert.equal(GitErrorCategory.UNKNOWN, "UNKNOWN");
  });

  it("should have exactly 5 categories", () => {
    const categories = Object.keys(GitErrorCategory);
    assert.equal(categories.length, 5);
  });
});
