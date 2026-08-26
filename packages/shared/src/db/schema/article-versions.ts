import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { articles } from "./articles";
import { changeTypeEnum, reviewStatusEnum } from "./enums";

// The append-only, hash-chained history entry — docs/DOMAIN.md #5, the entity
// that encodes the build prompt's "append-only" and "per-asset hash chain"
// invariants. A row here is created once per publish/correction and, once
// `reviewStatus` leaves `draft`, is never updated or deleted (enforced by the
// `article_versions_append_only` trigger in
// migrations/0001_append_only_triggers.sql — draft rows remain freely editable
// since nobody has seen them, per OPEN_QUESTIONS.md #9).
//
// `contentHash`/`previousHash` are SHA-256 hex over the canonical serialization
// frozen in packages/anchoring (Sprint 2+); the column exists now so the contract
// is fixed before that code is written.
export const articleVersions = pgTable("article_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id),
  versionMajor: integer("version_major").notNull(),
  versionMinor: integer("version_minor").notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  authorName: text("author_name").notNull(),
  tags: text("tags").array(),
  sourceLinks: text("source_links").array(),
  changeType: changeTypeEnum("change_type").notNull(),
  // Nullable only for the original version (v1.0); every correction must say what
  // changed.
  changeSummary: text("change_summary"),
  reviewStatus: reviewStatusEnum("review_status").notNull().default("draft"),
  previousVersionId: uuid("previous_version_id").references(
    (): AnyPgColumn => articleVersions.id,
  ),
  // Null until the hash is computed at submission time (draft rows have none).
  contentHash: text("content_hash"),
  previousHash: text("previous_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Null while `reviewStatus = 'draft'`; server-assigned at submission, never
  // client-supplied (build prompt invariant, "Timestamps are not client-supplied").
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  articleVersionUnique: unique("article_version_unique").on(
    table.articleId,
    table.versionMajor,
    table.versionMinor,
  ),
  versionNonNegative: check(
    "version_non_negative",
    sql`${table.versionMajor} >= 0 and ${table.versionMinor} >= 0`,
  ),
  // Serves "full version history for this article" (ArticleEditHistory.tsx,
  // VersionHistory.tsx) — the public, unauthenticated read path.
  articleIdIdx: index("article_versions_article_id_idx").on(table.articleId),
}));
