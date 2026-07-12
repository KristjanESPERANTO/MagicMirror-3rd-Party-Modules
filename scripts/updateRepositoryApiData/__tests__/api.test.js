import { describe, it } from "node:test";
import assert from "node:assert";

import { normalizeRepositoryData } from "../api.ts";

describe("updateRepositoryApiData/api", () => {
  it("exposes GitHub subscriber count as watchersCount", () => {
    const normalized = normalizeRepositoryData({
      stargazers_count: 12,
      subscribers_count: 0,
      has_issues: true,
      archived: false,
      defaultBranchRef: { target: { committedDate: "2026-01-01T00:00:00.000Z" } }
    }, null, "github");

    assert.strictEqual(normalized.watchersCount, 0);
    assert.strictEqual(normalized.stars, 12);
  });

  it("keeps a non-zero GitHub subscriber count intact", () => {
    const normalized = normalizeRepositoryData({
      stargazers_count: 12,
      subscribers_count: 7,
      has_issues: true,
      archived: false,
      defaultBranchRef: { target: { committedDate: "2026-01-01T00:00:00.000Z" } }
    }, null, "github");

    assert.strictEqual(normalized.watchersCount, 7);
  });
});
