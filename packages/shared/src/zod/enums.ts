import { z } from "./z";

export const accountRoleSchema = z.enum([
  "reader",
  "publisher",
  "reviewer",
  "admin",
]);

export const publisherVerificationStatusSchema = z.enum([
  "unverified",
  "pending",
  "verified",
  "rejected",
]);

export const reviewerApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export const articleCategorySchema = z.enum([
  "politics",
  "technology",
  "health",
  "science",
  "business",
]);

export const changeTypeSchema = z.enum([
  "original_published",
  "major_update",
  "minor_correction",
]);

export const reviewStatusSchema = z.enum(["draft", "pending_review", "verified"]);

export const anchorStatusSchema = z.enum(["pending", "anchored", "anchor_failed"]);

export const evidenceFileTypeSchema = z.enum(["image", "video", "document"]);

export const evidenceTagSchema = z.enum([
  "cover_image",
  "media",
  "evidence",
  "source",
]);

export const reviewTypeSchema = z.enum([
  "confirmation",
  "clarification",
  "correction_note",
]);

// A stored event — never includes "open" (see disputeStatusSchema below).
export const disputeEventTypeSchema = z.enum([
  "publisher_responded",
  "withdrawn",
  "resolved_corrected",
  "resolved_addressed_no_verdict",
]);

// The dispute's current, derived status: "open" when it has zero events, else
// the most recent event's type. Never stored — computed at read time.
export const disputeStatusSchema = z.enum([
  "open",
  "publisher_responded",
  "withdrawn",
  "resolved_corrected",
  "resolved_addressed_no_verdict",
]);

export const redactionCategorySchema = z.enum([
  "court_order",
  "defamation_ruling",
  "right_to_erasure",
]);

// Reader-facing computed trust status — never stored, always derived at read
// time from registry membership + version match + publisher verification +
// dispute state (docs/DOMAIN.md #12). Resolves OPEN_QUESTIONS.md #6c: all 6
// values from the original design brief are in scope, not just the 4 the
// frontend implements today.
export const trustStatusSchema = z.enum([
  "authentic",
  "authentic_under_review",
  "updated",
  "disputed",
  "publisher_unverified",
  "notfound",
]);
