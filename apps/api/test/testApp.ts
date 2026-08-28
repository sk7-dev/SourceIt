import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { migrationsPath, schema } from "@sourceit/shared";
import { buildApp } from "../src/app";
import type { SessionVerifier } from "../src/auth/verifySession";

// Integration tests hit real HTTP against a real database (build prompt
// Section 3) — normally a disposable Postgres via Testcontainers, with both
// migrations actually applied, not a mock. The one substitution is
// `verifySession`: see src/auth/verifySession.ts for why that specific
// boundary is fake here.
//
// Escape hatch: if TEST_DATABASE_URL is set, connect to it directly instead of
// starting a Testcontainers container — for environments where Docker isn't
// available but a real Postgres is (e.g. a manually-started instance). The
// schema is dropped and recreated first so each run starts clean; this is
// never done on TEST_DATABASE_URL-unset (Testcontainers) runs, which always
// get a fresh, isolated container per file anyway. Because every test *file*
// would otherwise race to drop/recreate the same external database, only use
// TEST_DATABASE_URL with `vitest run --no-file-parallelism`.
export async function startTestApp() {
  const externalUrl = process.env.TEST_DATABASE_URL;
  const container = externalUrl ? null : await new PostgreSqlContainer("postgres:16-alpine").start();
  const pool = new Pool({ connectionString: externalUrl ?? container!.getConnectionUri() });
  const db = drizzle(pool, { schema });

  if (externalUrl) {
    // Drizzle's own migration-tracking table lives in a separate `drizzle`
    // schema — resetting only `public` leaves it believing every migration is
    // already applied, and it silently skips recreating any tables at all.
    await db.execute(
      sql`drop schema public cascade; create schema public; drop schema if exists drizzle cascade;`,
    );
  }

  await migrate(db, { migrationsFolder: migrationsPath });

  const app = buildApp({ db, verifySession: fakeVerifySession });
  await app.ready();

  return {
    app,
    db,
    async close() {
      await app.close();
      await pool.end();
      await container?.stop();
    },
  };
}

// Fixed mapping from bearer token to clerkUserId — tests set up accounts rows
// with a matching clerk_user_id and pass `Bearer <clerkUserId>` as the token.
export const fakeVerifySession: SessionVerifier = async (authorizationHeader) => {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const clerkUserId = authorizationHeader.slice("Bearer ".length);
  return clerkUserId ? { clerkUserId } : null;
};
