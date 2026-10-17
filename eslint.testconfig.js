import { MAGICMIRROR_PLUGIN } from "./scripts/check-modules/javascript-check.ts";
import { MIGRATED_PACKAGE_NAMES } from "./scripts/check-modules/package-json-check.ts";
import { defineConfig } from "eslint/config";
import depend from "eslint-plugin-depend";
import globals from "globals";
import { flatConfigs as importX } from "eslint-plugin-import-x";
import js from "@eslint/js";
import packageJson from "eslint-plugin-package-json";

export default defineConfig([
  {
    ignores: ["**/*.min.js"]
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { magicmirror: MAGICMIRROR_PLUGIN },
    rules: {
      "magicmirror/prefer-native-fetch": "warn",
      "magicmirror/no-deprecated-apis": "warn",
      "magicmirror/prefer-node-protocol": ["warn", { version: ">=22.6.0" }]
    },
    linterOptions: { noInlineConfig: true }
  },
  {
    files: ["**/*.{js,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        config: "readonly",
        Log: "readonly",
        MM: "readonly",
        Module: "readonly",
        moment: "readonly",
        Temporal: "readonly"
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off"
    },
    plugins: { js },
    extends: [importX.recommended, "js/recommended"],
    rules: {
      "import-x/no-unresolved": "off",
      "no-prototype-builtins": "off",
      "no-redeclare": "off",
      "no-undef": "off"
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        Temporal: "readonly"
      },
      sourceType: "module"
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off"
    },
    plugins: { js },
    extends: [importX.recommended, "js/recommended"],
    rules: {
      "import-x/no-unresolved": "off"
    }
  },
  {
    files: ["**/package.json"],
    plugins: { depend, packageJson, magicmirror: MAGICMIRROR_PLUGIN },
    extends: ["packageJson/recommended"],
    languageOptions: {
      parserOptions: { jsonSyntax: "JSON" }
    },
    linterOptions: { noInlineConfig: true },
    rules: {
      "magicmirror/no-outdated-packages": "warn",
      "depend/ban-dependencies": ["error", { allowed: ["lint-staged", "moment", ...MIGRATED_PACKAGE_NAMES] }],
      "package-json/require-type": "error",
      "package-json/order-properties": "off",
      "package-json/require-exports": "off",
      "package-json/require-files": "off",
      "package-json/require-sideEffects": "off",
      "package-json/sort-collections": [
        "error",
        [
          "config",
          "dependencies",
          "devDependencies",
          "exports",
          "optionalDependencies",
          "overrides",
          "peerDependencies",
          "peerDependenciesMeta"
        ]
      ]
    }
  }
]);
