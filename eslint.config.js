import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  {
    ...pluginReactConfig,
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  {
    // Only the two classic hooks rules. The v7 "recommended" preset also
    // enables the React Compiler rules, which this codebase doesn't target.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    rules: {
        "react/react-in-jsx-scope": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "react/prop-types": "off",
        "@typescript-eslint/no-unused-vars": ["error", {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_"
        }]
    }
  },
  {
    // Node-side files: build/lint config and maintenance scripts.
    files: ["scripts/**/*.{cjs,js,ts}", "tools/**/*.{cjs,js}", "*.config.{js,ts}", "eslint.config.js"],
    languageOptions: { globals: globals.node }
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    files: ["workers/**/*.js"],
    languageOptions: { globals: globals.worker }
  },
  {
    ignores: ["dist/**", "tools/**/out/**"]
  }
];
