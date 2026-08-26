import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articleVersions } from "./article-versions";
import { anchorBatchStatusEnum, anchorStatusEnum } from "./enums";

// One row per scheduled Merkle-batch anchoring run — build prompt Section
// "Third-party systems in scope": "batch hashes into a Merkle tree, anchor the
// root on a schedule." Mutable by design (submitted/confirmed/failed are real
// state transitions of an in-flight chain transaction, not content history).
export const anchorBatches = pgTable("anchor_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  merkleRoot: text("merkle_root"),
  chainTxHash: text("chain_tx_hash"),
  status: anchorBatchStatusEnum("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

// One row per ArticleVersion — the reader-facing verification root of truth,
// docs/DOMAIN.md #13. `status` is the anchor track from OPEN_QUESTIONS.md #1's
// resolution: always one of pending/anchored/anchor_failed, always surfaced, never
// implied by the version's presence alone. Created as `pending` the moment a
// non-draft version is submitted.
export const anchorRecords = pgTable("anchor_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .unique()
    .references(() => articleVersions.id),
  anchorBatchId: uuid("anchor_batch_id").references(() => anchorBatches.id),
  status: anchorStatusEnum("status").notNull().default("pending"),
  leafHash: text("leaf_hash").notNull(),
  merkleProof: jsonb("merkle_proof").$type<string[]>(),
  blockHeight: integer("block_height"),
  chainConfirmations: integer("chain_confirmations").notNull().default(0),
  anchoredAt: timestamp("anchored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
