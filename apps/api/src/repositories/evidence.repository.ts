import { and, asc, eq, gt } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

export function createEvidenceRepository(db: typeof Db) {
  return {
    // The version plus the publisher that owns its article — one join, so the
    // service can make its authorization decision and its draft/not-draft
    // decision without a second round trip.
    async findVersionWithPublisher(versionId: string) {
      const [row] = await db
        .select({
          id: schema.articleVersions.id,
          reviewStatus: schema.articleVersions.reviewStatus,
          publisherId: schema.articles.publisherId,
        })
        .from(schema.articleVersions)
        .innerJoin(schema.articles, eq(schema.articleVersions.articleId, schema.articles.id))
        .where(eq(schema.articleVersions.id, versionId))
        .limit(1);
      return row ?? null;
    },

    async findEvidenceById(evidenceId: string) {
      const [row] = await db.select().from(schema.evidence).where(eq(schema.evidence.id, evidenceId)).limit(1);
      return row ?? null;
    },

    async createEvidence(input: {
      articleVersionId: string;
      fileType: "image" | "video" | "document";
      tag: "cover_image" | "media" | "evidence" | "source";
      filename: string;
      caption: string | null;
      contentHash: string;
      storageKey: string;
      sourceUrl: string | null;
      isArchivedSnapshot: boolean;
    }) {
      const [row] = await db.insert(schema.evidence).values(input).returning();
      return row!;
    },

    // Keyset-paginated on `id`. `created_at` is deliberately not the sort key:
    // Postgres stores it to microseconds but a JS Date (and an ISO string) only
    // carries milliseconds, so a createdAt cursor re-serves rows that share a
    // millisecond — which rapid same-request appends do hit. `id` is a total,
    // stable order that round-trips exactly. Order within a version's evidence
    // is not otherwise meaningful (it is a flat per-version list).
    async listEvidence(versionId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.evidence.id, cursor) : undefined;
      const rows = await db
        .select()
        .from(schema.evidence)
        .where(and(eq(schema.evidence.articleVersionId, versionId), cursorFilter))
        .orderBy(asc(schema.evidence.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },
  };
}
