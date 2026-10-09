/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// eslint.config.cjs
const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const a11y = require("eslint-plugin-jsx-a11y");
const imp = require("eslint-plugin-import");
const reactRefresh = require("eslint-plugin-react-refresh");

module.exports = [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**", "assets/**"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024 }
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": { typescript: { project: "./tsconfig.json", alwaysTryTypes: true } }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": a11y,
      import: imp,
      "react-refresh": reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      ...imp.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      "import/no-unresolved": "off",
      "import/extensions": "off",
      "import/no-absolute-path": "off",
      "import/no-mutable-exports": "off",
      "import/prefer-default-export": "off",
      quotes: "off",
      // Keep console at warn (not error) so a stray log never blocks the preview build — matches the genesis app config.
      "no-console": "warn",
      semi: ["error", "always"],
      "react/react-in-jsx-scope": "off",
      "react-refresh/only-export-components": "warn",
      "react/prop-types": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/no-autofocus": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "jsx-a11y/label-has-associated-control": "warn",
      "react/no-unescaped-entities": "warn",
      "import/exports-last": "off"
    }
  },
  // Vendored C3 Design System components.
  //
  // `src/components/ui/**` is copied verbatim from the c3-frontend skill's
  // design-system reference (c3design house style: no semicolons, double quotes,
  // React 19 idioms). It is re-synced from that source, so we do NOT reformat it
  // to the app's stylistic rules — instead we turn off the purely-stylistic rules
  // here so `npm run lint` stays green and a future re-sync doesn't churn.
  // This includes `no-unused-vars` and `no-explicit-any`: the vendored source is
  // owned upstream, not hand-maintained here, so we don't lint it for those.
  // Genuinely load-bearing rules (React hooks — `react-hooks/*`) are left ON so a
  // real bug in vendored code still surfaces.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    languageOptions: {
      // The vendored components run in the browser and reference `process.env`
      // (bundlers inline it); include node globals so `process` isn't flagged.
      globals: { ...globals.browser, ...globals.node, ...globals.es2024 },
    },
    rules: {
      semi: "off",
      quotes: "off",
      "no-undef": "off",
      "react-refresh/only-export-components": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
    },
  },
  // Test files: enable Jest globals and relax a few rules so `npm run lint` doesn't fail on describe/it/expect.
  {
    files: [
      "src/**/__tests__/**/*.{js,jsx,ts,tsx}",
      "src/**/*.{test,spec}.{js,jsx,ts,tsx}",
      "tests/**/*.{js,jsx,ts,tsx}"
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024, ...globals.jest }
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/no-children-prop": "off",
      "react/prop-types": "off",
      "jsx-a11y/no-autofocus": "off"
    }
  }
];
