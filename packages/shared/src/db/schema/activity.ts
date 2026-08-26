import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { publishers } from "./publishers";
import { articles } from "./articles";
import { articleVersions } from "./article-versions";
import { activityTypeEnum } from "./enums";

// Publisher-facing audit-trail feed — docs/DOMAIN.md #11. Append-only by nature
// (an event log); no trigger needed since nothing in the design ever updates a
// past event, only appends new ones.
export const activityEvents = pgTable("activity_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  publisherId: uuid("publisher_id")
    .notNull()
    .references(() => publishers.id),
  type: activityTypeEnum("type").notNull(),
  title: text("title").notNull(),
  articleId: uuid("article_id").references(() => articles.id),
  articleVersionId: uuid("article_version_id").references(
    () => articleVersions.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves the RecentActivity feed, newest first, per publisher.
  publisherIdCreatedAtIdx: index("activity_events_publisher_id_created_at_idx").on(
    table.publisherId,
    table.createdAt,
  ),
}));
