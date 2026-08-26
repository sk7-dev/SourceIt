import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { redactionCategorySchema } from "./enums";

// The permanent, publicly visible tombstone (resolves OPEN_QUESTIONS.md #5):
// position (articleVersionId), hash, timestamp, and redaction category, exactly
// as the build prompt requires. Content itself is never included — a redacted
// version's headline/summary/content fields are unservable at the read layer.
export const redactionSchema = z
  .object({
    articleVersionId: uuidSchema,
    category: redactionCategorySchema,
    tombstoneHash: z.string(),
    redactedAt: isoDatetimeSchema,
  })
  .openapi("Redaction");

// Admin-only, per OPEN_QUESTIONS.md #8's resolved admin role. `reason` is the
// legal detail (court order docket, etc.) and is not part of the public
// redactionSchema above.
export const createRedactionRequestSchema = z
  .object({
    category: redactionCategorySchema,
    reason: z.string().min(1),
  })
  .openapi("CreateRedactionRequest");
