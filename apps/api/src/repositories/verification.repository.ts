import { and, desc, eq, inArray, isNull, ne, notExists } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// A dispute is open iff it has no terminal event — which, by the
// terminal-lifecycle rule, is always its last event once present.
const TERMINAL_DISPUTE_EVENTS = ["withdrawn", "resolved_corrected", "resolved_addressed_no_verdict"] as const;

export function createVerificationRepository(db: typeof Db) {
  function hasNoTerminalEvent() {
    return notExists(
      db
        .select({ one: schema.disputeEvents.id })
        .from(schema.disputeEvents)
        .where(
          and(
            eq(schema.disputeEvents.disputeId, schema.disputes.id),
            inArray(schema.disputeEvents.eventType, [...TERMINAL_DISPUTE_EVENTS]),
          ),
        ),
    );
  }

  async function findVersionIdsWithOpenDispute(versionIds: string[]): Promise<Set<string>> {
    if (versionIds.length === 0) return new Set();
    const rows = await db
      .selectDistinct({ articleVersionId: schema.disputes.articleVersionId })
      .from(schema.disputes)
      .where(and(inArray(schema.disputes.articleVersionId, versionIds), hasNoTerminalEvent()));
    return new Set(rows.map((r) => r.articleVersionId));
  }

  return {
    findVersionIdsWithOpenDispute,

    async findArticle(articleId: string) {
      const [row] = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.id, articleId))
        .limit(1);
      return row ?? null;
    },

    async findPublisher(publisherId: string) {
      const [row] = await db
        .select()
        .from(schema.publishers)
        .where(eq(schema.publishers.id, publisherId))
        .limit(1);
      return row ?? null;
    },

    // Every non-draft version of the article, newest first — the public version
    // history and (index 0) the current version.
    async listPublishedVersions(articleId: string) {
      return db
        .select()
        .from(schema.articleVersions)
        .where(
          and(
            eq(schema.articleVersions.articleId, articleId),
            ne(schema.articleVersions.reviewStatus, "draft"),
          ),
        )
        .orderBy(desc(schema.articleVersions.versionMajor), desc(schema.articleVersions.versionMinor));
    },

    async findRedactionForVersion(versionId: string) {
      const [row] = await db
        .select({
          articleVersionId: schema.redactions.articleVersionId,
          category: schema.redactions.category,
          tombstoneHash: schema.redactions.tombstoneHash,
          redactedAt: schema.redactions.redactedAt,
        })
        .from(schema.redactions)
        .where(eq(schema.redactions.articleVersionId, versionId))
        .limit(1);
      return row ?? null;
    },

    async countOpenDisputesForVersion(versionId: string) {
      const rows = await db
        .select({ id: schema.disputes.id })
        .from(schema.disputes)
        .where(and(eq(schema.disputes.articleVersionId, versionId), hasNoTerminalEvent()));
      return rows.length;
    },

    // For the credibility computation: every published (>=1 non-draft version),
    // non-archived article of the publisher, with its current version's review
    // status, how many non-draft versions it has, and whether that current
    // version has an open dispute. Batch-loaded (3 queries), not N+1.
    async creditAggregate(publisherId: string) {
      const articles = await db
        .select({ id: schema.articles.id })
        .from(schema.articles)
        .where(and(eq(schema.articles.publisherId, publisherId), isNull(schema.articles.archivedAt)));
      if (articles.length === 0) return [];

      const versions = await db
        .select({
          articleId: schema.articleVersions.articleId,
          id: schema.articleVersions.id,
          reviewStatus: schema.articleVersions.reviewStatus,
        })
        .from(schema.articleVersions)
        .where(
          and(
            inArray(
              schema.articleVersions.articleId,
              articles.map((a) => a.id),
            ),
            ne(schema.articleVersions.reviewStatus, "draft"),
          ),
        )
        .orderBy(desc(schema.articleVersions.versionMajor), desc(schema.articleVersions.versionMinor));

      const byArticle = new Map<string, { current: (typeof versions)[number]; count: number }>();
      for (const v of versions) {
        const entry = byArticle.get(v.articleId);
        if (entry) entry.count += 1;
        else byArticle.set(v.articleId, { current: v, count: 1 });
      }
      if (byArticle.size === 0) return [];

      const openDisputeVersionIds = await findVersionIdsWithOpenDispute(
        [...byArticle.values()].map((e) => e.current.id),
      );

      return [...byArticle.values()].map((e) => ({
        currentReviewStatus: e.current.reviewStatus,
        publishedVersionCount: e.count,
        hasOpenDispute: openDisputeVersionIds.has(e.current.id),
      }));
    },
  };
}
