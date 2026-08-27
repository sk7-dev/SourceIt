import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { migrationsPath, schema } from "@sourceit/shared";
import { buildApp } from "../src/app";
import type { SessionVerifier } from "../src/auth/verifySession";

// Integration tests hit real HTTP against a real database (build prompt
// Section 3) — a disposable Postgres via Testcontainers, with both migrations
// actually applied, not a mock. The one substitution is `verifySession`: see
// src/auth/verifySession.ts for why that specific boundary is fake here.
export async function startTestApp() {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  const db = drizzle(pool, { schema });

  await migrate(db, { migrationsFolder: migrationsPath });

  const app = buildApp({ db, verifySession: fakeVerifySession });
  await app.ready();

  return {
    app,
    db,
    async close() {
      await app.close();
      await pool.end();
      await container.stop();
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
