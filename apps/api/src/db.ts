import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "@sourceit/shared";
import { env } from "./env";

// Owns its own pool rather than importing packages/shared/src/db/client.ts,
// which parses its own copy of DATABASE_URL from process.env independently —
// apps/api is the one place config validation should happen (cross-cutting
// standard: config parsed and validated with Zod at boot, once).
export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
