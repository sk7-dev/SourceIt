import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// Repositories do no HTTP concepts — plain data access, per the build prompt's
// layering rule (route → validate → service → repository → database).
export function createAccountsRepository(db: typeof Db) {
  async function findByClerkUserId(clerkUserId: string) {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.clerkUserId, clerkUserId))
      .limit(1);
    return account ?? null;
  }

  return {
    findByClerkUserId,

    async findByEmail(email: string) {
      const [account] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.email, email))
        .limit(1);
      return account ?? null;
    },

    // The Clerk↔accounts mirror row, created lazily on the caller's first
    // authed write (Sprint 10 registration flow). Idempotent on `clerkUserId`:
    // if a row already exists it is returned unchanged — `role` / `email` /
    // `fullName` from a later call do not overwrite it, so a reviewer who later
    // registers a publisher keeps their original row.
    async ensureAccount(input: {
      clerkUserId: string;
      email: string;
      fullName: string;
      role: "reader" | "publisher" | "reviewer" | "admin";
    }) {
      const existing = await findByClerkUserId(input.clerkUserId);
      if (existing) return existing;
      const [created] = await db.insert(schema.accounts).values(input).returning();
      return created!;
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
