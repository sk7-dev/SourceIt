import { z } from "zod";

// Cross-cutting standard: parsed and validated with Zod at boot. The process
// refuses to start on a missing or malformed variable rather than failing at
// 3am on first use.
const envSchema = z
  .object({
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

    // --- real S3-compatible ObjectStore (Sprint 17) ------------------------
    // Unset ⇒ the in-memory fake (dev / test). Works with AWS S3, Cloudflare
    // R2, Backblaze B2, or MinIO — set OBJECT_STORE_ENDPOINT for anything but
    // real AWS S3.
    OBJECT_STORE_BUCKET: z.string().min(1).optional(),
    OBJECT_STORE_REGION: z.string().min(1).optional(),
    OBJECT_STORE_ACCESS_KEY_ID: z.string().min(1).optional(),
    OBJECT_STORE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    OBJECT_STORE_ENDPOINT: z.string().url().optional(),
    OBJECT_STORE_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
    OBJECT_STORE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  })
  .superRefine((v, ctx) => {
    if (v.OBJECT_STORE_BUCKET === undefined) return;
    for (const key of ["OBJECT_STORE_REGION", "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY"] as const) {
      if (v[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when OBJECT_STORE_BUCKET is set`,
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
