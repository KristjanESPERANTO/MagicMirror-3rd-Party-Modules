import type { Rule } from "eslint";
import depend from "eslint-plugin-depend";
import { getRuleById } from "./rule-registry.ts";

const PACKAGE_RULE_IDS = new Map([
  ["electron-rebuild", "pkg-deprecated-electron-rebuild"],
  ["eslint-config-airbnb", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-config-airbnb-base", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-config-airbnb-typescript", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-config-airbnb-typescript-base", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-plugin-json", "pkg-recommend-eslint-plugin-json"],
  ["eslint-plugin-jsonc", "pkg-recommend-eslint-plugin-json"],
  ["grunt", "pkg-deprecated-grunt"],
  ["needle", "pkg-recommend-needle"],
  ["rollup-plugin-banner", "pkg-deprecated-rollup-banner"],
  ["rollup-plugin-banner2", "pkg-deprecated-rollup-banner"],
  ["stylelint-config-prettier", "pkg-deprecated-stylelint-config-prettier"],
  ["stylelint-config-prettier-scss", "pkg-deprecated-stylelint-config-prettier"]
]);
const HUSKY_RULE_ID = "pkg-outdated-husky-install";
const PACKAGE_PROPERTY_SELECTOR = "Program > JSONExpressionStatement > JSONObjectExpression > JSONProperty";
const dependencyRule = depend.rules!["ban-dependencies"];

export const MIGRATED_PACKAGE_NAMES = [...PACKAGE_RULE_IDS.keys()];

export const packageJsonRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: Object.fromEntries([
      ...Array.from(PACKAGE_RULE_IDS.values(), id => [id, `{{name}}: ${getRuleById(id)!.description}`]),
      [HUSKY_RULE_ID, getRuleById(HUSKY_RULE_ID)!.description]
    ])
  },
  create(context) {
    const listener = dependencyRule.create(Object.create(context, {
      options: { value: [{ presets: [], modules: MIGRATED_PACKAGE_NAMES }] },
      report: {
        value(descriptor: Rule.ReportDescriptor) {
          const name = "data" in descriptor ? descriptor.data?.name : null;
          const messageId = typeof name === "string" ? PACKAGE_RULE_IDS.get(name) : null;
          if (messageId && "node" in descriptor) {
            context.report({ node: descriptor.node, messageId, data: { name: String(name) } });
          }
        }
      }
    }));
    return {
      ...listener,
      [PACKAGE_PROPERTY_SELECTOR](node: Rule.Node) {
        const property = node as unknown as { key: { value?: unknown } };
        if (property.key.value === "peerDependencies" || property.key.value === "optionalDependencies") {
          listener[PACKAGE_PROPERTY_SELECTOR]?.(Object.create(node, {
            key: { value: { type: "JSONLiteral", value: "dependencies" } }
          }));
        }
        else {
          listener[PACKAGE_PROPERTY_SELECTOR]?.(node);
        }
      },
      [`${PACKAGE_PROPERTY_SELECTOR}[key.value='scripts'] > JSONObjectExpression > JSONProperty > JSONLiteral.value`](node: Rule.Node) {
        const command = (node as unknown as { value?: unknown }).value;
        if (typeof command === "string" && /\bhusky\s+install\b/u.test(command)) {
          context.report({ node, messageId: HUSKY_RULE_ID });
        }
      }
    };
  }
};