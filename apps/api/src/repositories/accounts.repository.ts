import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// Repositories do no HTTP concepts — plain data access, per the build prompt's
// layering rule (route → validate → service → repository → database).
export function createAccountsRepository(db: typeof Db) {
  return {
    async findByClerkUserId(clerkUserId: string) {
      const [account] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.clerkUserId, clerkUserId))
        .limit(1);
      return account ?? null;
    },

    async findPublisherIdsForAccount(accountId: string) {
      const rows = await db
        .select({ publisherId: schema.publisherMembers.publisherId })
        .from(schema.publisherMembers)
        .where(eq(schema.publisherMembers.accountId, accountId));
      return rows.map((r) => r.publisherId);
    },

    async findReviewerIdForAccount(accountId: string) {
      const [reviewer] = await db
        .select({ id: schema.reviewers.id })
        .from(schema.reviewers)
        .where(eq(schema.reviewers.accountId, accountId))
        .limit(1);
      return reviewer?.id ?? null;
    },
  };
}
