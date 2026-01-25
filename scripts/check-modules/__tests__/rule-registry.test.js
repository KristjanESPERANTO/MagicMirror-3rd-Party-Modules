import {
  PACKAGE_JSON_RULES,
  PACKAGE_LOCK_RULES,
  PIPELINE_CHECK_STAGE_IDS,
  RULES_BY_STAGE,
  RULE_REGISTRY,
  TEXT_RULES,
  getRuleById,
  getRulesForStage
} from "../rule-registry.js";

import assert from "node:assert/strict";
import test from "node:test";

const DEFAULT_STAGE = PIPELINE_CHECK_STAGE_IDS.MODERN;
const LEGACY_STAGE = PIPELINE_CHECK_STAGE_IDS.LEGACY;

test("every rule declares at least one stage", () => {
  for (const rule of RULE_REGISTRY) {
    assert.ok(Array.isArray(rule.stages), `Rule ${rule.id} should expose stages array.`);
    assert.notEqual(rule.stages.length, 0, `Rule ${rule.id} should target at least one stage.`);
  }
});

test("stage subsets expose rules by stage id", () => {
  const defaultRules = getRulesForStage(DEFAULT_STAGE);
  const legacyRules = getRulesForStage(LEGACY_STAGE);

  assert.ok(Array.isArray(defaultRules));
  assert.ok(Array.isArray(legacyRules));
  assert.ok(defaultRules.every(rule => rule.stages.includes(DEFAULT_STAGE)), "Default stage rules should reference modern stage id");
  assert.ok(legacyRules.every(rule => rule.stages.includes(LEGACY_STAGE)), "Legacy stage rules should reference legacy stage id");
});

test("stage map includes exported subsets", () => {
  assert.equal(RULES_BY_STAGE[DEFAULT_STAGE], getRulesForStage(DEFAULT_STAGE));
  assert.equal(RULES_BY_STAGE[LEGACY_STAGE], getRulesForStage(LEGACY_STAGE));
});

test("text/package rules filtered to modern stage", () => {
  for (const rule of TEXT_RULES) {
    assert.ok(rule.stages.includes(DEFAULT_STAGE), `Text rule ${rule.id} should apply to modern stage.`);
  }
  for (const rule of PACKAGE_JSON_RULES) {
    assert.ok(rule.stages.includes(DEFAULT_STAGE), `package.json rule ${rule.id} should apply to modern stage.`);
  }
  for (const rule of PACKAGE_LOCK_RULES) {
    assert.ok(rule.stages.includes(DEFAULT_STAGE), `package-lock rule ${rule.id} should apply to modern stage.`);
  }
});

test("unknown stage returns an empty array", () => {
  const result = getRulesForStage("unknown-stage");
  assert.deepEqual(result, [], "Unknown stage should return frozen empty array");
  assert.ok(Object.isFrozen(result), "Empty result should be frozen");
});

test("legacy mismatch rule remains accessible", () => {
  const rule = getRuleById("legacy-main-js-mismatch");
  assert.ok(rule, "Legacy rule should exist in registry");
  assert.ok(rule.stages.includes(LEGACY_STAGE), "Legacy rule should belong to legacy stage");
});
