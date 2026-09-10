import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { articles } from "./articles";
import { publishers } from "./publishers";

// Bookmark, not a copy of the article — docs/DOMAIN.md #9. Removing a row
// unbookmarks; it never affects the underlying article.
export const savedArticles = pgTable("saved_articles", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  oneSavePerReader: unique("one_save_per_reader").on(
    table.accountId,
    table.articleId,
  ),
  // GET /saved-articles is `WHERE account_id = $1 AND id > $cursor ORDER BY id`
  // — the (account_id, article_id) unique index can't order by `id`, so without
  // this the planner scans the primary key and filters by account (Phase 5
  // EXPLAIN audit).
  byAccountKeyset: index("saved_articles_account_id_id_idx").on(table.accountId, table.id),
}));

// docs/DOMAIN.md #10.
export const publisherFollows = pgTable("publisher_follows", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  publisherId: uuid("publisher_id")
    .notNull()
    .references(() => publishers.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  oneFollowPerReader: unique("one_follow_per_reader").on(
    table.accountId,
    table.publisherId,
  ),
  // Same keyset shape as saved_articles — GET /publisher-follows.
  byAccountKeyset: index("publisher_follows_account_id_id_idx").on(table.accountId, table.id),
}));
