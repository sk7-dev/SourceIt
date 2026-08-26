import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { disputeEventTypeSchema, disputeStatusSchema } from "./enums";
import { reviewerPublicSchema } from "./reviewers";

export const disputeEventSchema = z
  .object({
    id: uuidSchema,
    eventType: disputeEventTypeSchema,
    note: z.string().nullable(),
    correctionVersionId: uuidSchema.nullable(),
    createdAt: isoDatetimeSchema,
  })
  .openapi("DisputeEvent");

// docs/DOMAIN.md #8. `status` is the most recent event's eventType, or "open"
// if `events` is empty — resolves OPEN_QUESTIONS.md #2.
export const disputeSchema = z
  .object({
    id: uuidSchema,
    articleVersionId: uuidSchema,
    filedBy: reviewerPublicSchema,
    reason: z.string(),
    status: disputeStatusSchema,
    events: z.array(disputeEventSchema),
    createdAt: isoDatetimeSchema,
  })
  .openapi("Dispute");

// A publisher cannot suppress a dispute — this endpoint only ever appends an
// event, never mutates or hides the filing (build prompt invariant).
export const fileDisputeRequestSchema = z
  .object({
    reason: z.string().min(1),
  })
  .openapi("FileDisputeRequest");

// Publisher's reply: free text, a correction (new ArticleVersion id), or both —
// resolves OPEN_QUESTIONS.md #2.
export const respondToDisputeRequestSchema = z
  .object({
    note: z.string().min(1).optional(),
    correctionVersionId: uuidSchema.optional(),
  })
  .refine((v) => v.note !== undefined || v.correctionVersionId !== undefined, {
    message: "a response must include a note, a correction, or both",
  })
  .openapi("RespondToDisputeRequest");

// Filed only by the reviewer who filed the dispute (withdrawn), or by the filer
// or an admin (resolved_*) — never by the publisher, per the invariant above.
export const resolveDisputeRequestSchema = z
  .object({
    eventType: z.enum([
      "withdrawn",
      "resolved_corrected",
      "resolved_addressed_no_verdict",
    ]),
    note: z.string().optional(),
  })
  .openapi("ResolveDisputeRequest");
