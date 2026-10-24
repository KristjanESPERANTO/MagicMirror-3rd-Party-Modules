import type { Rule } from "eslint";
import type { AST } from "yaml-eslint-parser";
import { getRuleById } from "./rule-registry.ts";
import { WORKFLOW_VERSION_POLICY } from "./workflow-version-policy.ts";

const ACTION_RULES = Object.entries(WORKFLOW_VERSION_POLICY.actions);
const NODE_VERSION_RULE_ID = WORKFLOW_VERSION_POLICY.node.ruleId;
const RULE_IDS = [...ACTION_RULES.map(([, policy]) => policy.ruleId), NODE_VERSION_RULE_ID];
const VERSION_TAG_REGEX = /^v(\d+)(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/u;
const NODE_VERSION_REGEX = /^v?(\d+)(?:$|[.-])/u;

function unwrapYamlContent(node: AST.YAMLContent | AST.YAMLWithMeta | null): AST.YAMLContent | null {
  if (!node) {
    return null;
  }
  return node.type === "YAMLWithMeta" ? unwrapYamlContent(node.value) : node;
}

function getScalarValues(node: AST.YAMLContent | AST.YAMLWithMeta | null): AST.YAMLScalar[] {
  const content = unwrapYamlContent(node);
  if (!content) {
    return [];
  }
  if (content.type === "YAMLScalar") {
    return [content];
  }
  if (content.type === "YAMLSequence") {
    return content.entries.flatMap(entry => getScalarValues(entry));
  }
  return [];
}

function scalarString(node: AST.YAMLContent | AST.YAMLWithMeta | null): string | null {
  const content = unwrapYamlContent(node);
  return content?.type === "YAMLScalar" && typeof content.value === "string" ? content.value : null;
}

function pairKey(node: AST.YAMLNode | null): string | null {
  if (node?.type !== "YAMLPair") {
    return null;
  }
  return scalarString(node.key);
}

function isWorkflowStepPair(node: AST.YAMLPair): boolean {
  return node.parent.parent.type === "YAMLSequence"
    && pairKey(node.parent.parent.parent) === "steps";
}

function isNodeVersionPair(node: AST.YAMLPair): boolean {
  const containerPair = node.parent.parent;
  if (pairKey(containerPair) === "matrix") {
    return pairKey(containerPair.parent.parent) === "strategy";
  }
  if (pairKey(containerPair) !== "with" || containerPair.parent.type !== "YAMLMapping") {
    return false;
  }
  return containerPair.parent.pairs.some(pair => pairKey(pair) === "uses"
    && scalarString(pair.value)?.startsWith("actions/setup-node@"));
}

export const workflowYamlRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: Object.fromEntries(RULE_IDS.map(id => [id, getRuleById(id)!.description]))
  },
  create(context) {
    return {
      YAMLPair(rawNode: Rule.Node) {
        const node = rawNode as unknown as AST.YAMLPair;
        const key = scalarString(node.key);
        if (key === "uses" && isWorkflowStepPair(node)) {
          const action = scalarString(node.value);
          if (action) {
            for (const [name, rule] of ACTION_RULES) {
              const version = action.startsWith(`${name}@`) ? action.slice(name.length + 1).match(VERSION_TAG_REGEX) : null;
              if (version && Number(version[1]) < rule.currentMajor) {
                context.report({ loc: node.value!.loc, messageId: rule.ruleId });
              }
            }
          }
        }
        if (key === "node-version" && isNodeVersionPair(node)) {
          for (const version of getScalarValues(node.value)) {
            const match = (typeof version.value === "string" || typeof version.value === "number")
              ? String(version.value).match(NODE_VERSION_REGEX)
              : null;
            if (match && Number(match[1]) < WORKFLOW_VERSION_POLICY.node.currentMajor) {
              context.report({ loc: version.loc, messageId: NODE_VERSION_RULE_ID });
            }
          }
        }
      }
    };
  }
};