import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { reviewTypeSchema } from "./enums";
import { reviewerPublicSchema } from "./reviewers";

// ReviewerNotes.tsx:5-15, ReviewsDisputes.tsx:5-30 merged into one shape — the
// two frontend views differ only in which fields they choose to render.
export const reviewSchema = z
  .object({
    id: uuidSchema,
    articleVersionId: uuidSchema,
    reviewer: reviewerPublicSchema,
    type: reviewTypeSchema,
    comment: z.string(),
    isRetracted: z.boolean(),
    retractedReason: z.string().nullable(),
    createdAt: isoDatetimeSchema,
  })
  .openapi("Review");

export const createReviewRequestSchema = z
  .object({
    type: reviewTypeSchema,
    comment: z.string().min(1),
  })
  .openapi("CreateReviewRequest");

export const retractReviewRequestSchema = z
  .object({
    reason: z.string().optional(),
  })
  .openapi("RetractReviewRequest");
