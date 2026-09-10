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
  // Comma-separated list of allowed browser origins (e.g. the Vite dev
  // server). Unset means "no cross-origin browser access" outside
  // development, where any origin is allowed for convenience.
  CORS_ORIGIN: z.string().optional(),
  // Rate limiting (Phase 5). The global per-IP budget for read requests over
  // RATE_LIMIT_WINDOW_MS; mutating requests (POST/PATCH/PUT/DELETE) get
  // RATE_LIMIT_WRITE_MAX instead. Health checks are never limited. Tune per
  // deployment; the defaults suit a single API instance behind Railway's proxy.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WRITE_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export const env = envSchema.parse(process.env);
