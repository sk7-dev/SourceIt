import { and, asc, eq, gt } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// The shape the list query and the single-review lookups both return, before
// the service turns it into the wire `Review`.
export interface ReviewRow {
  id: string;
  articleVersionId: string;
  reviewerId: string;
  reviewerAccountId: string;
  reviewerPseudonym: string | null;
  reviewerUseLegalName: boolean;
  reviewerTitle: string | null;
  reviewerFullName: string;
  type: string;
  comment: string;
  createdAt: Date;
  retractedAt: Date | null;
  retractedReason: string | null;
}

const reviewColumns = {
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
} as const;

export function createReviewsRepository(db: typeof Db) {
  function baseQuery() {
    return db
      .select(reviewColumns)
      .from(schema.reviews)
      .innerJoin(schema.reviewers, eq(schema.reviews.reviewerId, schema.reviewers.id))
      .innerJoin(schema.accounts, eq(schema.reviewers.accountId, schema.accounts.id))
      .leftJoin(schema.reviewRetractions, eq(schema.reviewRetractions.reviewId, schema.reviews.id));
  }

  return {
    // The version plus the publisher that owns its article — lets the service
    // make its authorization decision and its draft/not-draft decision in one
    // round trip. Mirrors evidence.repository's equivalent.
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

    async createReview(input: {
      articleVersionId: string;
      reviewerId: string;
      type: "confirmation" | "clarification" | "correction_note";
      comment: string;
    }) {
      const [inserted] = await db.insert(schema.reviews).values(input).returning({ id: schema.reviews.id });
      const [row] = await baseQuery().where(eq(schema.reviews.id, inserted!.id)).limit(1);
      return row as ReviewRow;
    },

    async findReviewById(reviewId: string): Promise<ReviewRow | null> {
      const [row] = await baseQuery().where(eq(schema.reviews.id, reviewId)).limit(1);
      return (row as ReviewRow | undefined) ?? null;
    },

    // Retraction is a new append-only row, never an UPDATE of the review (build
    // prompt: "a retracted review remains visible … with its original text
    // intact"). The unique constraint on review_id makes a second retract a
    // constraint violation, which the service maps to 409.
    async createRetraction(input: { reviewId: string; reason: string | null }) {
      await db.insert(schema.reviewRetractions).values(input);
      const [row] = await baseQuery().where(eq(schema.reviews.id, input.reviewId)).limit(1);
      return row as ReviewRow;
    },

    // Keyset-paginated on `reviews.id` — same reasoning as evidence: a
    // millisecond-truncated createdAt cursor re-serves same-millisecond rows.
    async listReviews(versionId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.reviews.id, cursor) : undefined;
      const rows = (await baseQuery()
        .where(and(eq(schema.reviews.articleVersionId, versionId), cursorFilter))
        .orderBy(asc(schema.reviews.id))
        .limit(limit + 1)) as ReviewRow[];
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },
  };
}
