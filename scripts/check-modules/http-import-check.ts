import { Linter } from "eslint";
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

const httpImportsRule: Rule.RuleModule = {
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

export const HTTP_IMPORT_ESLINT_CONFIG: Linter.Config = {
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  linterOptions: { noInlineConfig: true },
  plugins: { "magicmirror": { rules: { "prefer-native-fetch": httpImportsRule } } },
  rules: { "magicmirror/prefer-native-fetch": "warn" }
};

const linter = new Linter();

export function checkHttpImports(content: string, relativePath: string): string[] {
  if (!/\.(?:[cm]?js)$/iu.test(relativePath)) {
    return [];
  }

  const messages = linter.verify(content, {
    ...HTTP_IMPORT_ESLINT_CONFIG,
    languageOptions: {
      ...HTTP_IMPORT_ESLINT_CONFIG.languageOptions,
      sourceType: relativePath.toLowerCase().endsWith(".cjs") ? "commonjs" : "module"
    }
  });

  return messages.flatMap(message => {
    const rule = message.messageId ? getRuleById(message.messageId) : null;
    return rule
      ? [`${rule.category}: Found an HTTP dependency import in file \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`]
      : [];
  });
}