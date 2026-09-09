import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

export interface DisputeRow {
  id: string;
  articleVersionId: string;
  reason: string;
  createdAt: Date;
  filerReviewerId: string;
  filerAccountId: string;
  filerPseudonym: string | null;
  filerUseLegalName: boolean;
  filerTitle: string | null;
  filerFullName: string;
}

export interface DisputeEventRow {
  id: string;
  disputeId: string;
  eventType: string;
  note: string | null;
  correctionVersionId: string | null;
  createdAt: Date;
}

const disputeColumns = {
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
} as const;

export function createDisputesRepository(db: typeof Db) {
  function baseQuery() {
    return db
      .select(disputeColumns)
      .from(schema.disputes)
      .innerJoin(schema.reviewers, eq(schema.disputes.filedByReviewerId, schema.reviewers.id))
      .innerJoin(schema.accounts, eq(schema.reviewers.accountId, schema.accounts.id));
  }

  return {
    // The disputed version plus the publisher that owns its article — one join,
    // for the authorization and draft/not-draft decisions.
    async findVersionWithPublisher(versionId: string) {
      const [row] = await db
        .select({
          id: schema.articleVersions.id,
          articleId: schema.articleVersions.articleId,
          reviewStatus: schema.articleVersions.reviewStatus,
          publisherId: schema.articles.publisherId,
        })
        .from(schema.articleVersions)
        .innerJoin(schema.articles, eq(schema.articleVersions.articleId, schema.articles.id))
        .where(eq(schema.articleVersions.id, versionId))
        .limit(1);
      return row ?? null;
    },

    // A version by id, constrained to one article — used to validate a
    // publisher's `correctionVersionId` really is a version of the disputed
    // article (and is published, not a private draft).
    async findVersionInArticle(versionId: string, articleId: string) {
      const [row] = await db
        .select({ id: schema.articleVersions.id, reviewStatus: schema.articleVersions.reviewStatus })
        .from(schema.articleVersions)
        .where(and(eq(schema.articleVersions.id, versionId), eq(schema.articleVersions.articleId, articleId)))
        .limit(1);
      return row ?? null;
    },

    async createDispute(input: { articleVersionId: string; filedByReviewerId: string; reason: string }) {
      const [inserted] = await db
        .insert(schema.disputes)
        .values(input)
        .returning({ id: schema.disputes.id });
      const [row] = await baseQuery().where(eq(schema.disputes.id, inserted!.id)).limit(1);
      return row as DisputeRow;
    },

    async findDisputeById(disputeId: string): Promise<DisputeRow | null> {
      const [row] = await baseQuery().where(eq(schema.disputes.id, disputeId)).limit(1);
      return (row as DisputeRow | undefined) ?? null;
    },

    // The disputed article's publisher and article id — for `dispute:respond`
    // authorization and correction-version validation.
    async findDisputeContext(disputeId: string) {
      const [row] = await db
        .select({
          articleId: schema.articleVersions.articleId,
          publisherId: schema.articles.publisherId,
        })
        .from(schema.disputes)
        .innerJoin(schema.articleVersions, eq(schema.disputes.articleVersionId, schema.articleVersions.id))
        .innerJoin(schema.articles, eq(schema.articleVersions.articleId, schema.articles.id))
        .where(eq(schema.disputes.id, disputeId))
        .limit(1);
      return row ?? null;
    },

    async appendEvent(input: {
      disputeId: string;
      eventType: "publisher_responded" | "withdrawn" | "resolved_corrected" | "resolved_addressed_no_verdict";
      note: string | null;
      correctionVersionId: string | null;
      actorAccountId: string;
    }) {
      await db.insert(schema.disputeEvents).values(input);
    },

    async listEvents(disputeId: string): Promise<DisputeEventRow[]> {
      return (await db
        .select()
        .from(schema.disputeEvents)
        .where(eq(schema.disputeEvents.disputeId, disputeId))
        .orderBy(asc(schema.disputeEvents.createdAt), asc(schema.disputeEvents.id))) as DisputeEventRow[];
    },

    async listEventsForDisputes(disputeIds: string[]): Promise<DisputeEventRow[]> {
      if (disputeIds.length === 0) return [];
      return (await db
        .select()
        .from(schema.disputeEvents)
        .where(inArray(schema.disputeEvents.disputeId, disputeIds))
        .orderBy(asc(schema.disputeEvents.createdAt), asc(schema.disputeEvents.id))) as DisputeEventRow[];
    },

    // Keyset-paginated on `disputes.id` — same reasoning as evidence/reviews.
    async listDisputes(versionId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.disputes.id, cursor) : undefined;
      const rows = (await baseQuery()
        .where(and(eq(schema.disputes.articleVersionId, versionId), cursorFilter))
        .orderBy(asc(schema.disputes.id))
        .limit(limit + 1)) as DisputeRow[];
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },
  };
}
