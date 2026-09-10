import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Scoped to apps/api, packages/shared, and packages/anchoring only (see root
// package.json's "lint" script) — apps/web is a Figma Make export we're told
// not to restyle or restructure, so it isn't linted here.
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Plain-Node CommonJS test fixtures (spawned as subprocesses) aren't part
    // of the TS/ESM sources.
    ignores: ["**/dist/**", "**/node_modules/**", "**/migrations/**", "**/test/fixtures/**"],
  },
);
