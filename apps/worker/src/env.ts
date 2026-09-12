import { z } from "zod";

// Cross-cutting standard: parsed and validated with Zod at boot. The process
// refuses to start on a missing or malformed variable rather than failing at
// 3am on first use.
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    // How often the anchoring sweep runs.
    ANCHOR_TICK_MS: z.coerce.number().int().min(100).default(5_000),
    // Most pending records folded into a single Merkle batch per sweep.
    ANCHOR_MAX_BATCH: z.coerce.number().int().min(1).default(256),
    // Failed submit/confirm attempts on a batch before it (and its records) are
    // marked failed / anchor_failed. See docs/ANCHORING.md.
    ANCHOR_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    // Confirmations at which the worker treats a submitted root as anchored.
    // The fake provider reports exactly this many.
    ANCHOR_CONFIRMATIONS: z.coerce.number().int().min(0).default(1),

    // --- real chain AnchorProvider (all four required together) -------------
    // Unset ⇒ the worker uses the in-memory fake provider (dev / CI).
    ANCHOR_RPC_URL: z.string().url().optional(),
    ANCHOR_CHAIN_ID: z.coerce.number().int().positive().optional(),
    ANCHOR_CONTRACT_ADDRESS: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 20-byte 0x address")
      .optional(),
    ANCHOR_SIGNER_PRIVATE_KEY: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte 0x private key")
      .optional(),
    // Lower bound for the on-chain `Anchored` log scan (the contract's deploy
    // block). Optional; defaults to 0.
    ANCHOR_CONTRACT_DEPLOY_BLOCK: z.coerce.bigint().nonnegative().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.ANCHOR_RPC_URL === undefined) return;
    for (const key of ["ANCHOR_CHAIN_ID", "ANCHOR_CONTRACT_ADDRESS", "ANCHOR_SIGNER_PRIVATE_KEY"] as const) {
      if (v[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when ANCHOR_RPC_URL is set`,
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
