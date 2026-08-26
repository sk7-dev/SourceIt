import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { reviewerApprovalStatusSchema } from "./enums";

// Public-facing shape — ReviewerNotes.tsx:8-9. `displayName` is either the
// reviewer's legal name or their pseudonym, resolving OPEN_QUESTIONS.md #10;
// the real identity (accounts.fullName) is never exposed by this schema.
export const reviewerPublicSchema = z
  .object({
    id: uuidSchema,
    displayName: z.string(),
    title: z.string().nullable(),
  })
  .openapi("ReviewerPublic");

export const reviewerSchema = z
  .object({
    id: uuidSchema,
    affiliation: z.string(),
    expertise: z.string(),
    title: z.string().nullable(),
    pseudonym: z.string().nullable(),
    useLegalName: z.boolean(),
    approvalStatus: reviewerApprovalStatusSchema,
    createdAt: isoDatetimeSchema,
  })
  .openapi("Reviewer");

// RegisterForm.tsx:265-319.
export const applyAsReviewerRequestSchema = z
  .object({
    affiliation: z.string().min(1),
    expertise: z.string().min(1),
    applicationReason: z.string().min(1),
  })
  .openapi("ApplyAsReviewerRequest");

export const reviewerDecisionRequestSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
  })
  .openapi("ReviewerDecisionRequest");
