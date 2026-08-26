import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articleVersions } from "./article-versions";
import { reviewers } from "./reviewers";
import { accounts } from "./accounts";
import { disputeEventTypeEnum } from "./enums";

// A dispute is its own entity, not a Review subtype — resolves
// OPEN_QUESTIONS.md #2. The filing itself is append-only, never updated or
// deleted (`disputes_append_only` trigger in
// migrations/0001_append_only_triggers.sql). Visible to everyone from the moment
// filed; nothing in this schema lets a publisher hide, delete, or delay it.
export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .references(() => articleVersions.id),
  filedByReviewerId: uuid("filed_by_reviewer_id")
    .notNull()
    .references(() => reviewers.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves "disputes against this version" (ReviewsDisputes.tsx, TrustStatusCards.tsx).
  articleVersionIdIdx: index("disputes_article_version_id_idx").on(
    table.articleVersionId,
  ),
}));

// Append-only lifecycle log for a dispute — current status is the most recent
// event's `eventType` (or "open" if none exist yet). A publisher may respond with
// free text, a correction (new ArticleVersion), or both; SourceIt does not
// adjudicate truth, so "resolved" here is procedural, never a verdict (build
// prompt Section 1).
export const disputeEvents = pgTable("dispute_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  disputeId: uuid("dispute_id")
    .notNull()
    .references(() => disputes.id),
  eventType: disputeEventTypeEnum("event_type").notNull(),
  note: text("note"),
  correctionVersionId: uuid("correction_version_id").references(
    () => articleVersions.id,
  ),
  actorAccountId: uuid("actor_account_id")
    .notNull()
    .references(() => accounts.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves "lifecycle history for this dispute" (current status = latest event).
  disputeIdIdx: index("dispute_events_dispute_id_idx").on(table.disputeId),
}));
