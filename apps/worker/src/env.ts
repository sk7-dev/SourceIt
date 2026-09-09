import { z } from "zod";

// Cross-cutting standard: parsed and validated with Zod at boot. The process
// refuses to start on a missing or malformed variable rather than failing at
// 3am on first use.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  // How often the anchoring sweep runs.
  ANCHOR_TICK_MS: z.coerce.number().int().min(100).default(5_000),
  // Most pending records folded into a single Merkle batch per sweep.
  ANCHOR_MAX_BATCH: z.coerce.number().int().min(1).default(256),
  // Failed submit/confirm attempts on a batch before it (and its records) are
  // marked failed / anchor_failed. See docs/ANCHORING.md.
  ANCHOR_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  // Confirmations the fake provider reports, and the threshold at which the
  // worker treats a submitted root as anchored.
  FAKE_ANCHOR_CONFIRMATIONS: z.coerce.number().int().min(0).default(1),
});

export const env = envSchema.parse(process.env);
