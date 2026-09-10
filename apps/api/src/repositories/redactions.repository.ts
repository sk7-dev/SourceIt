import { eq, inArray } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// The public tombstone shape — the legal `reason` and `redactedByAccountId` are
// never selected into anything a caller sees (build prompt / decision
// 2026-08-26: category, position, hash, timestamp are public; the legal reason
// is not).
export interface RedactionTombstone {
  articleVersionId: string;
  category: string;
  tombstoneHash: string;
  redactedAt: Date;
}

const tombstoneColumns = {
  articleVersionId: schema.redactions.articleVersionId,
  category: schema.redactions.category,
  tombstoneHash: schema.redactions.tombstoneHash,
  redactedAt: schema.redactions.redactedAt,
} as const;

export function createRedactionsRepository(db: typeof Db) {
  return {
    async findByVersionId(versionId: string): Promise<RedactionTombstone | null> {
      const [row] = await db
        .select(tombstoneColumns)
        .from(schema.redactions)
        .where(eq(schema.redactions.articleVersionId, versionId))
        .limit(1);
      return row ?? null;
    },

    // Batch lookup for the list / composed read paths — one query, keyed by
    // version id, mirroring verification.repository's findVerifiedVersionIds.
    async findForVersions(versionIds: string[]): Promise<Map<string, RedactionTombstone>> {
      if (versionIds.length === 0) return new Map();
      const rows = await db
        .select(tombstoneColumns)
        .from(schema.redactions)
        .where(inArray(schema.redactions.articleVersionId, versionIds));
      return new Map(rows.map((r) => [r.articleVersionId, r]));
    },

    // The article_version_id UNIQUE constraint makes a second redaction a
    // constraint violation; the service pre-checks with findByVersionId and
    // maps a hit to 409.
    async create(input: {
      articleVersionId: string;
      category: string;
      reason: string;
      tombstoneHash: string;
      redactedByAccountId: string;
    }): Promise<RedactionTombstone> {
      await db.insert(schema.redactions).values({
        articleVersionId: input.articleVersionId,
        category: input.category as never,
        reason: input.reason,
        tombstoneHash: input.tombstoneHash,
        redactedByAccountId: input.redactedByAccountId,
      });
      const [row] = await db
        .select(tombstoneColumns)
        .from(schema.redactions)
        .where(eq(schema.redactions.articleVersionId, input.articleVersionId))
        .limit(1);
      return row!;
    },
  };
}
