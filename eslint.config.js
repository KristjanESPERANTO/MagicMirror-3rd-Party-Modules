import css from "@eslint/css";
import {defineConfig} from "eslint/config";
import globals from "globals";
import {flatConfigs as importX} from "eslint-plugin-import-x";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import packageJson from "eslint-plugin-package-json";
import stylistic from "@stylistic/eslint-plugin";

export default defineConfig([
  {
    ignores: [
      "modules/*",
      "modules_temp/*",
      "docs/data/modules*.json",
      "docs/fonts/*",
      "docs/result.html",
      "docs/result.md"
    ]
  },
  {files: ["**/*.css"], languageOptions: {tolerant: true}, plugins: {css}, language: "css/css", extends: ["css/recommended"], rules: {"css/use-baseline": ["error", {available: "newly"}]}},
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser
      }
    },
    plugins: {js, stylistic},
    extends: [importX.recommended, "js/all", "stylistic/all"],
    rules: {
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/implicit-arrow-linebreak": "off",
      "@stylistic/indent": ["error", 2],
      "@stylistic/multiline-ternary": "off",
      "@stylistic/object-property-newline": ["error", {allowAllPropertiesOnSameLine: true}],
      "@stylistic/padded-blocks": ["error", "never"],
      "@stylistic/quote-props": ["error", "as-needed"],
      camelcase: "off",
      complexity: "off",
      "func-style": "off",
      "import-x/no-unresolved": ["error", {ignore: ["eslint/config", "logger"]}],
      "id-length": ["error", {exceptions: ["a", "b"]}],
      "max-lines": ["warn", 500],
      "max-lines-per-function": ["warn", 150],
      "max-params": ["warn", 5],
      "max-statements": ["warn", 60],
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
      "sort-keys": "off"
    }
  },
  {files: ["**/*.json"], ignores: ["package.json", "package-lock.json"], plugins: {json}, extends: ["json/recommended"], language: "json/json"},
  {files: ["package.json"], plugins: {packageJson}, extends: ["packageJson/recommended"], rules: {"package-json/sort-collections": "off"}},
  {files: ["**/*.md"], plugins: {markdown}, language: "markdown/gfm", extends: ["markdown/recommended"]}
]);
