import { eq } from "drizzle-orm";
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
  };
}
