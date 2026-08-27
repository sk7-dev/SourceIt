import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";
import { migrationsPath } from "./migrationsPath";

await migrate(db, { migrationsFolder: migrationsPath });
await pool.end();
console.log("migrations applied");
