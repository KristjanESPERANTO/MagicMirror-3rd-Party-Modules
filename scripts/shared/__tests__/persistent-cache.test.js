import { equal, ok } from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createPersistentCache } from "../../shared/persistent-cache.js";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";

async function createTempFilePath(prefix = "cache-test-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return join(dir, "cache.json");
}

function createClock() {
  let now = Date.now();
  return {
    now() {
      return now;
    },
    advance(ms) {
      now += ms;
      return now;
    }
  };
}

test("persistent cache stores and retrieves values with ttl", async () => {
  const clock = createClock();
  const filePath = await createTempFilePath();
  const cache = createPersistentCache({ filePath, now: () => clock.now(), defaultTtlMs: 1000 });

  await cache.load();
  const inserted = cache.set("foo", { answer: 42 });
  equal(inserted.value.answer, 42);

  const hit = cache.get("foo");
  ok(hit, "expected cache hit");
  equal(hit.value.answer, 42);
  ok(hit.expiresAt, "should set expiration");

  clock.advance(1500);
  const expired = cache.get("foo");
  equal(expired, null, "entry should expire after ttl");
});

test("persistent cache persists entries to disk", async () => {
  const clock = createClock();
  const filePath = await createTempFilePath();
  const cache = createPersistentCache({ filePath, now: () => clock.now(), defaultTtlMs: 0 });

  await cache.load();
  cache.set("alpha", { value: "one" });
  await cache.flush();

  const contents = await readFile(filePath, "utf8");
  ok(contents.includes("alpha"));

  const second = createPersistentCache({ filePath, now: () => clock.now(), defaultTtlMs: 0 });
  await second.load();
  const hit = second.get("alpha");
  ok(hit, "expected persisted hit");
  equal(hit.value.value, "one");
});

test("persistent cache supports per-entry ttl overrides", async () => {
  const clock = createClock();
  const filePath = await createTempFilePath();
  const cache = createPersistentCache({ filePath, now: () => clock.now(), defaultTtlMs: 5000 });

  await cache.load();
  cache.set("short", { value: 1 }, { ttlMs: 1000 });
  cache.set("long", { value: 2 });

  clock.advance(1500);

  const short = cache.get("short");
  const longer = cache.get("long");

  equal(short, null, "short ttl should expire");
  ok(longer, "long ttl should persist");
  equal(longer.value.value, 2);
});
