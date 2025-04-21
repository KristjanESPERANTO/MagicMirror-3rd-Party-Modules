import {configs as dependConfigs} from "eslint-plugin-depend";
import eslintPluginImport from "eslint-plugin-import";
import eslintPluginJs from "@eslint/js";
import eslintPluginPackageJson from "eslint-plugin-package-json";
import globals from "globals";

const config = [
  dependConfigs["flat/recommended"],
  eslintPluginImport.flatConfigs.recommended,
  eslintPluginJs.configs.recommended,
  eslintPluginPackageJson.configs.recommended,
  {
    "ignores": ["**/*.min.js"]
  },
  {
    "files": ["**/*.js"],
    "languageOptions": {
      "ecmaVersion": "latest",
      "globals": {
        ...globals.browser,
        ...globals.node,
        "config": "readonly",
        "Log": "readonly",
        "MM": "readonly",
        "Module": "readonly",
        "moment": "readonly"
      },
      "sourceType": "commonjs"
    },
    "linterOptions": {
      "reportUnusedDisableDirectives": "off"
    },
    "rules": {
      "depend/ban-dependencies": ["error", {"allowed": ["moment", "eslint-plugin-import"]}],
      "import/no-unresolved": "off",
      "no-prototype-builtins": "off",
      "no-redeclare": "off",
      "no-undef": "off"
    }
  },
  {
    "files": ["**/*.mjs"],
    "languageOptions": {
      "ecmaVersion": "latest",
      "globals": {
        ...globals.node
      },
      "sourceType": "module"
    },
    "linterOptions": {
      "reportUnusedDisableDirectives": "off"
    },
    "rules": {
      "depend/ban-dependencies": ["error", {"allowed": ["moment", "eslint-plugin-import"]}],
      "import/no-unresolved": "off"
    }
  },
  {
    "files": ["**/package.json"],
    "rules": {
      "depend/ban-dependencies": ["error", {"allowed": ["moment"]}],
      "package-json/order-properties": "off"
    }
  }
];

export default config;
