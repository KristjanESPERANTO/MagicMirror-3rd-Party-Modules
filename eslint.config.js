import globals from "globals";
import importPlugin from "eslint-plugin-import";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";

export default [
  js.configs.all,
  stylistic.configs["all-flat"],
  {
    "ignores": [
      "modules/*",
      "modules_temp/*",
      "docs/modules*.json",
      "result.md"
    ]
  },
  {
    "files": ["**/*.js"],
    "languageOptions": {
      "globals": {
        ...globals.browser
      }
    },
    "plugins": {
      "import": importPlugin
    },
    "rules": {
      ...importPlugin.configs.recommended.rules,
      "func-style": "off",
      "id-length": ["error", {"exceptions": ["a", "b"]}],
      // Until now this rule doesn't run in flat config
      "import/namespace": "off",
      "max-depth": ["error", 5],
      "max-lines-per-function": ["error", 120],
      "max-statements": "off",
      "no-await-in-loop": "off",
      "no-console": "off",
      "no-magic-numbers": "off",
      "no-ternary": "off",
      "one-var": "off",
      "prefer-destructuring": "off",
      "prefer-named-capture-group": "off",
      "require-atomic-updates": "off",
      "sort-keys": "off",
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/implicit-arrow-linebreak": "off",
      "@stylistic/indent": ["error", 2],
      "@stylistic/object-property-newline": "off",
      "@stylistic/padded-blocks": ["error", "never"]
    }
  }
];
