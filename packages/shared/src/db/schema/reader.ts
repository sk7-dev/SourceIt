import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
}));
