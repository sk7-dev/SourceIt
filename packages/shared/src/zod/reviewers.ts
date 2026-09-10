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

// RegisterForm.tsx:265-319. `fullName` / `email` were added on implementation
// (Sprint 10): the endpoint runs behind a session-only guard and materializes
// the caller's `accounts` mirror row on first authed write, so it needs the
// identity fields the Clerk session token doesn't carry. The trusted key is
// still the verified `clerkUserId`; these are the profile mirror only.
export const applyAsReviewerRequestSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.string().email(),
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
