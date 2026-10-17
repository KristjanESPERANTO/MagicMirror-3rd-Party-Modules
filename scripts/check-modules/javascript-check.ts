import { Linter } from "eslint";
import type { Rule } from "eslint";
import type { Node } from "estree";
import { HTTP_IMPORT_ESLINT_CONFIG } from "./http-import-check.ts";
import { getRuleById } from "./rule-registry.ts";

const DEPRECATED_API_RULE_IDS = [
  "text-deprecated-new-buffer",
  "text-deprecated-getYear",
  "text-deprecated-fs-F_OK",
  "text-deprecated-fs-R_OK",
  "text-deprecated-fs-W_OK",
  "text-deprecated-fs-X_OK"
];
const FS_ACCESS_CONSTANTS = new Set(["F_OK", "R_OK", "W_OK", "X_OK"]);
type Builtin = "Buffer" | "Date" | "date-instance" | "buffer-module" | "fs-module";

function propertyName(node: Node): string | null {
  if (node.type === "Identifier") {
    return node.name;
  }
  return node.type === "Literal" && typeof node.value === "string" ? node.value : null;
}

function moduleBuiltin(name: string): Builtin | null {
  if (name === "fs" || name === "node:fs") {
    return "fs-module";
  }
  return name === "buffer" || name === "node:buffer" ? "buffer-module" : null;
}

const deprecatedApisRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: Object.fromEntries(DEPRECATED_API_RULE_IDS.map(id => [id, `{{api}}: ${getRuleById(id)!.description}`]))
  },
  create(context) {
    function findVariable(node: Node, name: string) {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) {
          return variable;
        }
        scope = scope.upper;
      }
      return undefined;
    }

    function resolveBuiltin(node: Node | null | undefined, visited = new Set<Node>()): Builtin | null {
      if (!node || visited.has(node)) {
        return null;
      }
      visited.add(node);

      if (node.type === "ChainExpression") {
        return resolveBuiltin(node.expression, visited);
      }
      if (node.type === "NewExpression") {
        return resolveBuiltin(node.callee, visited) === "Date" ? "date-instance" : null;
      }
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require"
        && node.arguments.length === 1 && !findVariable(node, "require")?.defs.length) {
        const source = node.arguments[0];
        return source.type === "Literal" && typeof source.value === "string" ? moduleBuiltin(source.value) : null;
      }
      if (node.type === "MemberExpression") {
        const name = !node.computed || node.property.type === "Literal" ? propertyName(node.property) : null;
        return name === "Buffer" && resolveBuiltin(node.object, visited) === "buffer-module" ? "Buffer" : null;
      }
      if (node.type !== "Identifier") {
        return null;
      }

      const variable = findVariable(node, node.name);
      if (!variable?.defs.length) {
        return node.name === "Buffer" || node.name === "Date" ? node.name : null;
      }
      if (variable.defs.length !== 1 || variable.references.some(reference => reference.isWrite() && !reference.init)) {
        return null;
      }

      const definition = variable.defs[0];
      if (definition.type === "ImportBinding" && definition.parent.type === "ImportDeclaration") {
        const builtin = moduleBuiltin(String(definition.parent.source.value));
        if (definition.node.type === "ImportSpecifier") {
          return builtin === "buffer-module" && propertyName(definition.node.imported) === "Buffer" ? "Buffer" : null;
        }
        return builtin;
      }
      if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
        if (definition.node.id.type === "Identifier") {
          return resolveBuiltin(definition.node.init, visited);
        }
        if (definition.node.id.type === "ObjectPattern") {
          const property = definition.node.id.properties.find(entry => entry.type === "Property"
            && entry.value.type === "Identifier" && entry.value.name === node.name);
          if (property?.type === "Property" && (!property.computed || property.key.type === "Literal")
            && propertyName(property.key) === "Buffer" && resolveBuiltin(definition.node.init, visited) === "buffer-module") {
            return "Buffer";
          }
        }
      }
      return null;
    }

    return {
      NewExpression(node) {
        if (resolveBuiltin(node.callee) === "Buffer") {
          context.report({ node, messageId: "text-deprecated-new-buffer", data: { api: "new Buffer()" } });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || (callee.computed && callee.property.type !== "Literal")) {
          return;
        }
        if (propertyName(callee.property) === "getYear" && resolveBuiltin(callee.object) === "date-instance") {
          context.report({ node, messageId: "text-deprecated-getYear", data: { api: "Date.getYear()" } });
        }
      },
      MemberExpression(node) {
        const name = !node.computed || node.property.type === "Literal" ? propertyName(node.property) : null;
        if (name && FS_ACCESS_CONSTANTS.has(name) && resolveBuiltin(node.object) === "fs-module") {
          context.report({ node, messageId: `text-deprecated-fs-${name}`, data: { api: `fs.${name}` } });
        }
      }
    };
  }
};

export const JAVASCRIPT_ESLINT_CONFIG: Linter.Config = {
  ...HTTP_IMPORT_ESLINT_CONFIG,
  plugins: {
    magicmirror: {
      rules: {
        ...HTTP_IMPORT_ESLINT_CONFIG.plugins?.magicmirror.rules,
        "no-deprecated-apis": deprecatedApisRule
      }
    }
  },
  rules: {
    ...HTTP_IMPORT_ESLINT_CONFIG.rules,
    "magicmirror/no-deprecated-apis": "warn"
  }
};

const linter = new Linter();

export function checkJavaScript(content: string, relativePath: string): string[] {
  if (!/\.[cm]?js$/iu.test(relativePath)) {
    return [];
  }

  const messages = linter.verify(content, {
    ...JAVASCRIPT_ESLINT_CONFIG,
    languageOptions: {
      ...JAVASCRIPT_ESLINT_CONFIG.languageOptions,
      sourceType: relativePath.toLowerCase().endsWith(".cjs") ? "commonjs" : "module"
    }
  });

  return messages.flatMap(message => {
    const rule = message.messageId ? getRuleById(message.messageId) : null;
    return rule
      ? [`${rule.category}: Found JavaScript usage in file \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`]
      : [];
  });
}