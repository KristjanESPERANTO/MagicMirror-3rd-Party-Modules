import type { Node } from "estree";
import type { Rule } from "eslint";
import { getRuleById } from "./rule-registry.ts";

const HTTP_IMPORT_RULE_IDS = new Map([
  ["request", "text-deprecated-request"],
  ["request-promise", "text-deprecated-request-promise"],
  ["native-request", "text-deprecated-native-request"],
  ["node-fetch", "text-recommend-node-fetch"],
  ["fetch", "text-recommend-require-fetch"],
  ["axios", "text-recommend-axios"]
]);

export const httpImportsRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: Object.fromEntries(
      Array.from(HTTP_IMPORT_RULE_IDS.values(), id => [id, `{{packageName}}: ${getRuleById(id)!.description}`])
    )
  },
  create(context) {
    function checkSource(source: Node | null | undefined) {
      if (source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }

      const packageName = source.value.split("/")[0];
      const messageId = HTTP_IMPORT_RULE_IDS.get(packageName);
      if (messageId) {
        context.report({ node: source, messageId, data: { packageName: source.value } });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
      ImportExpression(node) {
        checkSource(node.source);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "require" || node.arguments.length !== 1) {
          return;
        }

        let scope = context.sourceCode.getScope(node);
        while (scope) {
          if (scope.set.get("require")?.defs.length) {
            return;
          }
          if (!scope.upper) {
            break;
          }
          scope = scope.upper;
        }
        checkSource(node.arguments[0]);
      }
    };
  }
};
