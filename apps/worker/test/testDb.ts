import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { migrationsPath, schema } from "@sourceit/shared";

// Same shape as apps/api/test/testApp.ts: a disposable Postgres via
// Testcontainers by default, with real migrations applied. If TEST_DATABASE_URL
// is set, connect to it directly (for Docker-less environments) — the schema is
// dropped and recreated first, so only run one test file at a time against it
// (vitest.config.ts already sets fileParallelism: false).
export async function startTestDb() {
  const externalUrl = process.env.TEST_DATABASE_URL;
  const container = externalUrl ? null : await new PostgreSqlContainer("postgres:16-alpine").start();
  const pool = new Pool({ connectionString: externalUrl ?? container!.getConnectionUri() });
  const db = drizzle(pool, { schema });

  if (externalUrl) {
    await db.execute(
      sql`drop schema public cascade; create schema public; drop schema if exists drizzle cascade;`,
    );
  }

  await migrate(db, { migrationsFolder: migrationsPath });

  return {
    db,
    async close() {
      await pool.end();
      await container?.stop();
    },
  };
}
