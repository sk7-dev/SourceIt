import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

await migrate(db, { migrationsFolder: "migrations" });
await pool.end();
console.log("migrations applied");
