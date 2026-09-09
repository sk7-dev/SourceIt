import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // env.ts parses DATABASE_URL eagerly on import; the integration test
    // overrides the pool with its own (see test/testDb.ts), so this value only
    // needs to satisfy the Zod schema.
    env: {
      DATABASE_URL: "postgres://placeholder:placeholder@localhost:5432/placeholder",
    },
    // The TEST_DATABASE_URL escape hatch resets one shared external database;
    // running test files in parallel against it would race (same constraint as
    // apps/api — see apps/api/test/testApp.ts).
    fileParallelism: false,
  },
});
