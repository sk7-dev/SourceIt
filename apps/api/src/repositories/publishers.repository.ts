import { and, eq } from "drizzle-orm";
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
  };
}
