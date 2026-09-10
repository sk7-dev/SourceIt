import { and, asc, eq, gt } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

export function createPublishersRepository(db: typeof Db) {
  return {
    async isMember(publisherId: string, accountId: string): Promise<boolean> {
      const [row] = await db
        .select({ publisherId: schema.publisherMembers.publisherId })
        .from(schema.publisherMembers)
        .where(
          and(
            eq(schema.publisherMembers.publisherId, publisherId),
            eq(schema.publisherMembers.accountId, accountId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async isVerified(publisherId: string): Promise<boolean> {
      const [row] = await db
        .select({ verificationStatus: schema.publishers.verificationStatus })
        .from(schema.publishers)
        .where(eq(schema.publishers.id, publisherId))
        .limit(1);
      return row?.verificationStatus === "verified";
    },

    async findById(publisherId: string) {
      const [row] = await db
        .select()
        .from(schema.publishers)
        .where(eq(schema.publishers.id, publisherId))
        .limit(1);
      return row ?? null;
    },

    async createPublisher(input: {
      clerkOrgId: string;
      organizationName: string;
      displayName: string;
      website: string;
      description: string;
    }) {
      const [row] = await db.insert(schema.publishers).values(input).returning();
      return row!;
    },

    async addMember(input: { publisherId: string; accountId: string; role: "owner" | "member" }) {
      await db.insert(schema.publisherMembers).values(input);
    },

    // The admin verification queue — keyset-paginated on `id`.
    async listByStatus(
      status: "unverified" | "pending" | "verified" | "rejected",
      cursor: string | undefined,
      limit: number,
    ) {
      const cursorFilter = cursor ? gt(schema.publishers.id, cursor) : undefined;
      const rows = await db
        .select()
        .from(schema.publishers)
        .where(and(eq(schema.publishers.verificationStatus, status), cursorFilter))
        .orderBy(asc(schema.publishers.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },

    async setVerification(
      publisherId: string,
      decision: "verified" | "rejected",
      byAccountId: string,
    ) {
      const [row] = await db
        .update(schema.publishers)
        .set({
          verificationStatus: decision,
          verifiedByAccountId: byAccountId,
          verifiedAt: decision === "verified" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.publishers.id, publisherId))
        .returning();
      return row ?? null;
    },
  };
}
