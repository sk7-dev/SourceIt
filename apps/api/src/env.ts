import { z } from "zod";

// Cross-cutting standard: parsed and validated with Zod at boot. The process
// refuses to start on a missing or malformed variable rather than failing at
// 3am on first use.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
