import { and, desc, eq, inArray, lt, lte, or } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// A composite keyset cursor over a chronological listing: `<createdAt ISO>~<id>`
// (three parts `<iso>~<kind>~<id>` for the two-table reviews+disputes stream).
// A JS Date is millisecond-precision, so createdAt alone can tie — the id (and
// kind) break the tie into a total order that round-trips exactly.
export function encodeCursor(parts: string[]): string {
  return parts.join("~");
}
export function decodeCursor(cursor: string | undefined, expectedParts: number): string[] | null {
  if (!cursor) return null;
  const parts = cursor.split("~");
  return parts.length === expectedParts ? parts : null;
}

export function createPublisherDashboardRepository(db: typeof Db) {
  return {
    // ---- activity feed (newest first, keyset on (createdAt, id)) ----

    async listActivity(publisherId: string, cursor: string | undefined, limit: number) {
      const c = decodeCursor(cursor, 2);
      const ts = c ? new Date(c[0]!) : null;
      const bound =
        c && ts
          ? or(
              lt(schema.activityEvents.createdAt, ts),
              and(eq(schema.activityEvents.createdAt, ts), lt(schema.activityEvents.id, c[1]!)),
            )
          : undefined;
      const rows = await db
        .select({
          id: schema.activityEvents.id,
          type: schema.activityEvents.type,
          title: schema.activityEvents.title,
          articleId: schema.activityEvents.articleId,
          createdAt: schema.activityEvents.createdAt,
        })
        .from(schema.activityEvents)
        .where(and(eq(schema.activityEvents.publisherId, publisherId), bound))
        .orderBy(desc(schema.activityEvents.createdAt), desc(schema.activityEvents.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor =
        rows.length > limit && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null;
      return { items, nextCursor };
    },

    async insertActivity(input: {
      publisherId: string;
      type: string;
      title: string;
      articleId?: string | null;
      articleVersionId?: string | null;
    }) {
      await db.insert(schema.activityEvents).values({
        publisherId: input.publisherId,
        type: input.type as never,
        title: input.title,
        articleId: input.articleId ?? null,
        articleVersionId: input.articleVersionId ?? null,
      });
    },

    // ---- credibility score history ----

    async latestCredibilityScore(publisherId: string): Promise<number | null> {
      const [row] = await db
        .select({ score: schema.credibilityScoreHistory.score })
        .from(schema.credibilityScoreHistory)
        .where(eq(schema.credibilityScoreHistory.publisherId, publisherId))
        .orderBy(desc(schema.credibilityScoreHistory.recordedAt), desc(schema.credibilityScoreHistory.id))
        .limit(1);
      return row?.score ?? null;
    },

    async insertCredibilityPoint(publisherId: string, score: number) {
      await db.insert(schema.credibilityScoreHistory).values({ publisherId, score });
    },

    async listCredibilityHistory(publisherId: string, cursor: string | undefined, limit: number) {
      const c = decodeCursor(cursor, 2);
      const ts = c ? new Date(c[0]!) : null;
      const bound =
        c && ts
          ? or(
              lt(schema.credibilityScoreHistory.recordedAt, ts),
              and(
                eq(schema.credibilityScoreHistory.recordedAt, ts),
                lt(schema.credibilityScoreHistory.id, c[1]!),
              ),
            )
          : undefined;
      const rows = await db
        .select({
          id: schema.credibilityScoreHistory.id,
          score: schema.credibilityScoreHistory.score,
          recordedAt: schema.credibilityScoreHistory.recordedAt,
        })
        .from(schema.credibilityScoreHistory)
        .where(and(eq(schema.credibilityScoreHistory.publisherId, publisherId), bound))
        .orderBy(desc(schema.credibilityScoreHistory.recordedAt), desc(schema.credibilityScoreHistory.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor =
        rows.length > limit && last ? encodeCursor([last.recordedAt.toISOString(), last.id]) : null;
      return { items, nextCursor };
    },

    // ---- reviews + disputes stream (two tables, one chronological page) ----

    async publisherReviewsPage(publisherId: string, tsCeil: Date | null, n: number) {
      const bound = tsCeil ? lte(schema.reviews.createdAt, tsCeil) : undefined;
      return db
        .select({
          id: schema.reviews.id,
          articleVersionId: schema.reviews.articleVersionId,
          reviewerId: schema.reviews.reviewerId,
          reviewerAccountId: schema.reviewers.accountId,
          reviewerPseudonym: schema.reviewers.pseudonym,
          reviewerUseLegalName: schema.reviewers.useLegalName,
          reviewerTitle: schema.reviewers.title,
          reviewerFullName: schema.accounts.fullName,
          type: schema.reviews.type,
          comment: schema.reviews.comment,
          createdAt: schema.reviews.createdAt,
          retractedAt: schema.reviewRetractions.retractedAt,
          retractedReason: schema.reviewRetractions.reason,
        })
        .from(schema.reviews)
        .innerJoin(schema.articleVersions, eq(schema.reviews.articleVersionId, schema.articleVersions.id))
        .innerJoin(schema.articles, eq(schema.articleVersions.articleId, schema.articles.id))
        .innerJoin(schema.reviewers, eq(schema.reviews.reviewerId, schema.reviewers.id))
        .innerJoin(schema.accounts, eq(schema.reviewers.accountId, schema.accounts.id))
        .leftJoin(schema.reviewRetractions, eq(schema.reviewRetractions.reviewId, schema.reviews.id))
        .where(and(eq(schema.articles.publisherId, publisherId), bound))
        .orderBy(desc(schema.reviews.createdAt), desc(schema.reviews.id))
        .limit(n);
    },

    async publisherDisputesPage(publisherId: string, tsCeil: Date | null, n: number) {
      const bound = tsCeil ? lte(schema.disputes.createdAt, tsCeil) : undefined;
      return db
        .select({
          id: schema.disputes.id,
          articleVersionId: schema.disputes.articleVersionId,
          reason: schema.disputes.reason,
          createdAt: schema.disputes.createdAt,
          filerReviewerId: schema.disputes.filedByReviewerId,
          filerAccountId: schema.reviewers.accountId,
          filerPseudonym: schema.reviewers.pseudonym,
          filerUseLegalName: schema.reviewers.useLegalName,
          filerTitle: schema.reviewers.title,
          filerFullName: schema.accounts.fullName,
        })
        .from(schema.disputes)
        .innerJoin(schema.articleVersions, eq(schema.disputes.articleVersionId, schema.articleVersions.id))
        .innerJoin(schema.articles, eq(schema.articleVersions.articleId, schema.articles.id))
        .innerJoin(schema.reviewers, eq(schema.disputes.filedByReviewerId, schema.reviewers.id))
        .innerJoin(schema.accounts, eq(schema.reviewers.accountId, schema.accounts.id))
        .where(and(eq(schema.articles.publisherId, publisherId), bound))
        .orderBy(desc(schema.disputes.createdAt), desc(schema.disputes.id))
        .limit(n);
    },

    async eventsForDisputes(disputeIds: string[]) {
      if (disputeIds.length === 0) {
        return [] as {
          id: string;
          disputeId: string;
          eventType: string;
          note: string | null;
          correctionVersionId: string | null;
          createdAt: Date;
        }[];
      }
      return db
        .select({
          id: schema.disputeEvents.id,
          disputeId: schema.disputeEvents.disputeId,
          eventType: schema.disputeEvents.eventType,
          note: schema.disputeEvents.note,
          correctionVersionId: schema.disputeEvents.correctionVersionId,
          createdAt: schema.disputeEvents.createdAt,
        })
        .from(schema.disputeEvents)
        .where(inArray(schema.disputeEvents.disputeId, disputeIds))
        .orderBy(schema.disputeEvents.createdAt);
    },
  };
}
