import * as fs from "fs";

import eslintPlugin from "@eslint/js";
import eslintPluginImport from "eslint-plugin-import";
import eslintPluginStylistic from "@stylistic/eslint-plugin";
import globals from "globals";

const config = [
  {
    "ignores": [
      "modules/*",
      "modules_temp/*",
      "docs/data/modules*.json",
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
      ...eslintPluginStylistic.configs["all-flat"].plugins,
      "import": eslintPluginImport
    },
    "rules": {
      ...eslintPlugin.configs.all.rules,
      ...eslintPluginImport.configs.recommended.rules,
      ...eslintPluginStylistic.configs["all-flat"].rules,
      "complexity": "off",
      "func-style": "off",
      "id-length": ["error", {"exceptions": ["a", "b"]}],
      // Until now this rule doesn't run in flat config
      "import/namespace": "off",
      "max-depth": ["warn", 5],
      "max-lines": ["warn", 400],
      "max-lines-per-function": ["warn", 150],
      "max-statements": "off",
      "no-await-in-loop": "off",
      "no-console": "off",
      "no-magic-numbers": "off",
      "no-param-reassign": "off",
      "no-ternary": "off",
      "no-use-before-define": "off",
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
      "@stylistic/multiline-ternary": "off",
      "@stylistic/object-property-newline": "off",
      "@stylistic/padded-blocks": ["error", "never"]
    }
  }
];

const debug = false;

if (debug === true) {
  fs.writeFile("eslint-config-DEBUG.json", JSON.stringify(config, null, 2), (error) => {
    if (error) {
      throw error;
    }
  });
}

export default config;
