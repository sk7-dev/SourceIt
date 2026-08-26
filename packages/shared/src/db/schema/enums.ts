import { pgEnum } from "drizzle-orm/pg-core";

// Account.role — see docs/DOMAIN.md #1. `admin` added in Sprint 1 to back the
// reviewer-approval and publisher-verification queues (PROJECT_STATE.md decision,
// 2026-08-26).
export const accountRoleEnum = pgEnum("account_role", [
  "reader",
  "publisher",
  "reviewer",
  "admin",
]);

// Publisher (org) verification lifecycle — resolves OPEN_QUESTIONS.md #6a.
export const publisherVerificationStatusEnum = pgEnum(
  "publisher_verification_status",
  ["unverified", "pending", "verified", "rejected"],
);

// Reviewer onboarding — resolves OPEN_QUESTIONS.md #8.
export const reviewerApprovalStatusEnum = pgEnum("reviewer_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

// Article category — docs/DOMAIN.md #4, PublishArticlePanel.tsx:97-108.
export const articleCategoryEnum = pgEnum("article_category", [
  "politics",
  "technology",
  "health",
  "science",
  "business",
]);

// ArticleVersion.changeType — docs/DOMAIN.md #5.
export const changeTypeEnum = pgEnum("change_type", [
  "original_published",
  "major_update",
  "minor_correction",
]);

// ArticleVersion review track — independent of anchor track. Resolves
// OPEN_QUESTIONS.md #6b (article/version lifecycle enum).
export const reviewStatusEnum = pgEnum("review_status", [
  "draft",
  "pending_review",
  "verified",
]);

// AnchorRecord.status — the anchor track, always surfaced, never hidden behind an
// optimistic badge (build prompt Section 1, "Anchoring is asynchronous"). Resolves
// OPEN_QUESTIONS.md #1.
export const anchorStatusEnum = pgEnum("anchor_status", [
  "pending",
  "anchored",
  "anchor_failed",
]);

export const anchorBatchStatusEnum = pgEnum("anchor_batch_status", [
  "pending",
  "submitted",
  "confirmed",
  "failed",
]);

// Evidence.fileType — docs/DOMAIN.md #6, MediaEvidenceUpload.tsx:14.
export const evidenceFileTypeEnum = pgEnum("evidence_file_type", [
  "image",
  "video",
  "document",
]);

// Evidence.tag — docs/DOMAIN.md #6, MediaEvidenceUpload.tsx:15, plus `cover_image`
// as its own tag per the three distinguished upload zones noted there.
export const evidenceTagEnum = pgEnum("evidence_tag", [
  "cover_image",
  "media",
  "evidence",
  "source",
]);

// Review.type — dispute is excluded here; it is now its own entity (see
// disputeStatusEnum below), resolving OPEN_QUESTIONS.md #2.
export const reviewTypeEnum = pgEnum("review_type", [
  "confirmation",
  "clarification",
  "correction_note",
]);

// Dispute lifecycle events — resolves OPEN_QUESTIONS.md #2. SourceIt does not
// adjudicate truth, so "resolved" here means procedurally addressed, never a
// truth verdict. `open` is deliberately excluded: it is never a stored event,
// only the derived status of a dispute with zero rows in dispute_events.
export const disputeEventTypeEnum = pgEnum("dispute_event_type", [
  "publisher_responded",
  "withdrawn",
  "resolved_corrected",
  "resolved_addressed_no_verdict",
]);

// Redaction category — build prompt Section 1 names exactly these three. Resolves
// OPEN_QUESTIONS.md #5.
export const redactionCategoryEnum = pgEnum("redaction_category", [
  "court_order",
  "defamation_ruling",
  "right_to_erasure",
]);

// ActivityEvent.type — docs/DOMAIN.md #11, extended with dispute_filed and
// redaction to cover the two new entities Sprint 1 adds.
export const activityTypeEnum = pgEnum("activity_type", [
  "publish",
  "blockchain",
  "review",
  "update",
  "correction",
  "dispute_filed",
  "redaction",
]);

export const publisherMemberRoleEnum = pgEnum("publisher_member_role", [
  "owner",
  "member",
]);
