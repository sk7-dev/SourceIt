import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { articleVersions } from "./article-versions";
import { reviewers } from "./reviewers";

// A reviewer's verification of a published version — Sprint 11. Modeled as an
// append-only child row rather than an UPDATE of `article_versions.review_status`
// (which the `article_versions_append_only` trigger forbids on a non-draft row,
// and the build prompt forbids in general). Presence of a row = the version is
// "verified"; the composed GET /articles/{id}/verification LEFT JOINs it and
// reports `reviewStatus: "verified"` when it exists. `article_versions.review_status`
// itself never leaves `pending_review` in the database.
//
// The `article_version_id` UNIQUE constraint makes a second verify a constraint
// violation, which the service pre-checks and maps to 409. The verifier is
// always an approved reviewer with no structural affiliation to the publisher
// (same gate as review:create), so the FK is to `reviewers`, not `accounts`.
export const versionVerifications = pgTable("version_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .unique()
    .references(() => articleVersions.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => reviewers.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
