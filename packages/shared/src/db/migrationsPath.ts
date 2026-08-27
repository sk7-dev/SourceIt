import { fileURLToPath } from "node:url";

// Absolute path to migrations/, resolved from this file's location rather than
// process.cwd() — so any consumer (packages/shared's own migrate.ts, or
// apps/api's test suite spinning up a disposable Postgres) gets the same
// folder regardless of where it's invoked from.
export const migrationsPath = fileURLToPath(new URL("../../migrations", import.meta.url));
