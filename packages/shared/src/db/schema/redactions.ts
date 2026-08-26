import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articleVersions } from "./article-versions";
import { accounts } from "./accounts";
import { redactionCategoryEnum } from "./enums";

// Legal takedown without history destruction — build prompt Section 1. Resolution
// is redaction, not deletion: the article_versions content becomes unservable at
// the read layer (Sprint 2+ service check for a row here), while this permanent,
// publicly visible tombstone (resolves OPEN_QUESTIONS.md #5) proves something
// existed at this position, its hash, timestamp, and redaction category.
export const redactions = pgTable("redactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .unique()
    .references(() => articleVersions.id),
  category: redactionCategoryEnum("category").notNull(),
  reason: text("reason").notNull(),
  tombstoneHash: text("tombstone_hash").notNull(),
  redactedByAccountId: uuid("redacted_by_account_id")
    .notNull()
    .references(() => accounts.id),
  redactedAt: timestamp("redacted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
