import eslintPluginImport from "eslint-plugin-import";
import eslintPluginJs from "@eslint/js";
import globals from "globals";

const config = [
  eslintPluginImport.flatConfigs.recommended,
  eslintPluginJs.configs.recommended,
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
      "import/no-unresolved": "off"
    }
  }
];

export default config;
