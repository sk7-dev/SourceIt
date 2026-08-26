import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articleVersions } from "./article-versions";
import { evidenceFileTypeEnum, evidenceTagEnum } from "./enums";

// Binds to a version, not an asset (build prompt invariant) — docs/DOMAIN.md #6.
// Append-only: never updated or deleted (`evidence_append_only` trigger in
// migrations/0001_append_only_triggers.sql). Replacing a file means uploading a
// new evidence row against a new article version, not editing this one.
export const evidence = pgTable("evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .references(() => articleVersions.id),
  fileType: evidenceFileTypeEnum("file_type").notNull(),
  tag: evidenceTagEnum("tag").notNull(),
  filename: text("filename").notNull(),
  caption: text("caption"),
  contentHash: text("content_hash").notNull(),
  storageKey: text("storage_key").notNull(),
  // Set when tag = 'source' and the URL was fetched-and-hashed at submission time
  // rather than merely linked — resolves OPEN_QUESTIONS.md #7.
  sourceUrl: text("source_url"),
  isArchivedSnapshot: boolean("is_archived_snapshot").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves "evidence for this version" (EvidenceSection.tsx).
  articleVersionIdIdx: index("evidence_article_version_id_idx").on(
    table.articleVersionId,
  ),
}));
