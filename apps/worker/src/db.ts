import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "@sourceit/shared";
import { env } from "./env";

// Owns its own pool (mirrors apps/api/src/db.ts) — the worker is its own
// deployable process with its own config validation at boot.
export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export type Db = typeof db;
