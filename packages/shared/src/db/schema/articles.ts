import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { publishers } from "./publishers";
import { articleCategoryEnum } from "./enums";

// The stable container an ArticleVersion attaches to — docs/DOMAIN.md #4.
// Content (headline/summary/body/tags/sources) lives on articleVersions, not
// here, because a correction is a new version, not an edit to the article.
export const articles = pgTable("articles", {
  id: uuid("id").defaultRandom().primaryKey(),
  publisherId: uuid("publisher_id")
    .notNull()
    .references(() => publishers.id),
  category: articleCategoryEnum("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves "list this publisher's articles" (MyArticlesTable.tsx).
  publisherIdIdx: index("articles_publisher_id_idx").on(table.publisherId),
}));
