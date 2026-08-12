// @ts-check
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const importPlugin = require("eslint-plugin-import");
const prettier = require("eslint-config-prettier");

/** Shared base ESLint flat config for every package in the monorepo. */
module.exports = [
  {
    ignores: ["dist/**", "build/**", ".next/**", ".turbo/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "import/no-cycle": ["error", { maxDepth: 1 }],
    },
  },
  prettier,
];
