import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { anchorStatusSchema } from "./enums";

// docs/DOMAIN.md #13 — the verification root of truth. `status` is always one
// of pending/anchored/anchor_failed and is always present in the response, never
// omitted or implied (resolves OPEN_QUESTIONS.md #1).
export const anchorRecordSchema = z
  .object({
    articleVersionId: uuidSchema,
    status: anchorStatusSchema,
    leafHash: z.string(),
    merkleProof: z.array(z.string()).nullable(),
    blockHeight: z.number().int().nullable(),
    chainConfirmations: z.number().int().min(0),
    anchoredAt: isoDatetimeSchema.nullable(),
  })
  .openapi("AnchorRecord");
