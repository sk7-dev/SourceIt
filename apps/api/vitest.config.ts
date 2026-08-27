import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // env.ts parses these eagerly on import even though the tests override
    // both the db pool and verifySession with test doubles (see
    // test/testApp.ts) — the values just need to satisfy the Zod schema, they
    // are never actually connected to or called.
    env: {
      DATABASE_URL: "postgres://placeholder:placeholder@localhost:5432/placeholder",
      CLERK_SECRET_KEY: "test_dummy_secret",
      CLERK_PUBLISHABLE_KEY: "test_dummy_publishable",
    },
  },
});
