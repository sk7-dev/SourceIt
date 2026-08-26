import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articleVersions } from "./article-versions";
import { reviewers } from "./reviewers";
import { reviewTypeEnum } from "./enums";

// Reviewer annotation — docs/DOMAIN.md #7. Append-only, attaches to a specific
// version (`reviews_append_only` trigger in
// migrations/0001_append_only_triggers.sql). Retraction is modeled as a separate
// append-only row in reviewRetractions rather than an UPDATE, so the original
// text is provably untouched.
export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .references(() => articleVersions.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => reviewers.id),
  type: reviewTypeEnum("type").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves "reviews for this version" (ReviewerNotes.tsx, ReviewsDisputes.tsx).
  articleVersionIdIdx: index("reviews_article_version_id_idx").on(
    table.articleVersionId,
  ),
}));

// Presence of a row = the review is retracted, per build prompt: "A retracted
// review remains visible, marked retracted, with its original text intact."
export const reviewRetractions = pgTable("review_retractions", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewId: uuid("review_id")
    .notNull()
    .unique()
    .references(() => reviews.id),
  reason: text("reason"),
  retractedAt: timestamp("retracted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
