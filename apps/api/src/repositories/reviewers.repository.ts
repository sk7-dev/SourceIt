import { and, asc, eq, gt } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

export function createReviewersRepository(db: typeof Db) {
  return {
    // The reviewer profile behind an account, if there is one. `approvalStatus`
    // is what the review:create gate checks — only an `approved` reviewer may
    // attach a review.
    async findByAccountId(accountId: string) {
      const [row] = await db
        .select({ id: schema.reviewers.id, approvalStatus: schema.reviewers.approvalStatus })
        .from(schema.reviewers)
        .where(eq(schema.reviewers.accountId, accountId))
        .limit(1);
      return row ?? null;
    },

    async findById(reviewerId: string) {
      const [row] = await db
        .select()
        .from(schema.reviewers)
        .where(eq(schema.reviewers.id, reviewerId))
        .limit(1);
      return row ?? null;
    },

    async createReviewer(input: {
      accountId: string;
      affiliation: string;
      expertise: string;
      applicationReason: string;
    }) {
      const [row] = await db.insert(schema.reviewers).values(input).returning();
      return row!;
    },

    // The admin approval queue — keyset-paginated on `id`.
    async listByStatus(status: "pending" | "approved" | "rejected", cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.reviewers.id, cursor) : undefined;
      const rows = await db
        .select()
        .from(schema.reviewers)
        .where(and(eq(schema.reviewers.approvalStatus, status), cursorFilter))
        .orderBy(asc(schema.reviewers.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },

    async setApproval(
      reviewerId: string,
      decision: "approved" | "rejected",
      byAccountId: string,
    ) {
      const [row] = await db
        .update(schema.reviewers)
        .set({
          approvalStatus: decision,
          approvedByAccountId: byAccountId,
          approvedAt: decision === "approved" ? new Date() : null,
        })
        .where(eq(schema.reviewers.id, reviewerId))
        .returning();
      return row ?? null;
    },
  };
}
