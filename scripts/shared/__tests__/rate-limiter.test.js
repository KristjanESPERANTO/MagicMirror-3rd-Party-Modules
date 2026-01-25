import { describe, it } from "node:test";
import assert from "node:assert";

import { createRateLimiter } from "../rate-limiter.js";

describe("RateLimiter", () => {
  it("should allow immediate execution when tokens are available", async () => {
    const limiter = createRateLimiter({ tokensPerInterval: 5, intervalMs: 100 });

    const results = [];
    results.push(await limiter.schedule(() => "task1"));
    results.push(await limiter.schedule(() => "task2"));

    assert.deepStrictEqual(results, ["task1", "task2"]);
  });

  it("should queue tasks when tokens are exhausted", async () => {
    const limiter = createRateLimiter({ tokensPerInterval: 2, intervalMs: 100 });

    const startTime = Date.now();
    const results = [];

    // First 2 tasks should execute immediately
    results.push(await limiter.schedule(() => "task1"));
    results.push(await limiter.schedule(() => "task2"));

    // Third task should wait for refill
    results.push(await limiter.schedule(() => "task3"));

    const duration = Date.now() - startTime;

    assert.deepStrictEqual(results, ["task1", "task2", "task3"]);
    // Duration should be at least the interval (100ms) but give some margin
    assert.ok(duration >= 90);
  });

  it("should return pending count correctly", async () => {
    const limiter = createRateLimiter({ tokensPerInterval: 1, intervalMs: 100 });

    // Use up the token
    await limiter.schedule(() => "task1");

    // Queue some tasks
    const promise1 = limiter.schedule(() => "task2");
    const promise2 = limiter.schedule(() => "task3");

    // Check pending count
    assert.strictEqual(limiter.getPendingCount(), 2);

    // Wait for them to complete
    await promise1;
    await promise2;

    assert.strictEqual(limiter.getPendingCount(), 0);
  });

  it("should handle tasks that throw errors", async () => {
    const limiter = createRateLimiter({ tokensPerInterval: 5, intervalMs: 100 });

    const error = new Error("Task failed");

    await assert.rejects(
      async () => {
        await limiter.schedule(() => {
          throw error;
        });
      },
      err => err === error
    );

    // Should still work after error
    const result = await limiter.schedule(() => "success");
    assert.strictEqual(result, "success");
  });

  it("should refill tokens at specified interval", async () => {
    const limiter = createRateLimiter({ tokensPerInterval: 2, intervalMs: 100 });

    // Consume all tokens
    await limiter.schedule(() => "task1");
    await limiter.schedule(() => "task2");

    const startTime = Date.now();

    // This should wait for refill
    await limiter.schedule(() => "task3");

    const duration = Date.now() - startTime;

    // Should wait approximately the interval time (with margin for timing)
    assert.ok(duration >= 90 && duration < 200);
  });

  it("should respect maxTokens limit", async () => {
    const limiter = createRateLimiter({
      tokensPerInterval: 1,
      intervalMs: 50,
      maxTokens: 2
    });

    // Wait for tokens to accumulate
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    /*
     * Should have at most 2 tokens (maxTokens), not 3
     * First 2 tasks should execute without waiting
     */
    const results = [];
    results.push(await limiter.schedule(() => "task1"));
    results.push(await limiter.schedule(() => "task2"));

    assert.deepStrictEqual(results, ["task1", "task2"]);
  });
});
