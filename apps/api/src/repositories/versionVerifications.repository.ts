import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// The identity-joined shape both the create and the lookup return, before the
// service turns it into the wire `VersionVerification`. Same reviewer columns as
// ReviewRow so `toApiVersionVerification` can reuse the pseudonym derivation.
export interface VersionVerificationRow {
  id: string;
  articleVersionId: string;
  reviewerId: string;
  reviewerPseudonym: string | null;
  reviewerUseLegalName: boolean;
  reviewerTitle: string | null;
  reviewerFullName: string;
  createdAt: Date;
}

const columns = {
  id: schema.versionVerifications.id,
  articleVersionId: schema.versionVerifications.articleVersionId,
  reviewerId: schema.versionVerifications.reviewerId,
  reviewerPseudonym: schema.reviewers.pseudonym,
  reviewerUseLegalName: schema.reviewers.useLegalName,
  reviewerTitle: schema.reviewers.title,
  reviewerFullName: schema.accounts.fullName,
  createdAt: schema.versionVerifications.createdAt,
} as const;

export function createVersionVerificationsRepository(db: typeof Db) {
  function baseQuery() {
    return db
      .select(columns)
      .from(schema.versionVerifications)
      .innerJoin(schema.reviewers, eq(schema.versionVerifications.reviewerId, schema.reviewers.id))
      .innerJoin(schema.accounts, eq(schema.reviewers.accountId, schema.accounts.id));
  }

  return {
    async findByVersionId(versionId: string): Promise<VersionVerificationRow | null> {
      const [row] = await baseQuery()
        .where(eq(schema.versionVerifications.articleVersionId, versionId))
        .limit(1);
      return (row as VersionVerificationRow | undefined) ?? null;
    },

    // Append-only insert. The article_version_id UNIQUE constraint is the
    // backstop; the service pre-checks with findByVersionId and maps a hit to
    // 409, mirroring review retraction.
    async create(input: { articleVersionId: string; reviewerId: string }) {
      const [inserted] = await db
        .insert(schema.versionVerifications)
        .values(input)
        .returning({ id: schema.versionVerifications.id });
      const [row] = await baseQuery()
        .where(eq(schema.versionVerifications.id, inserted!.id))
        .limit(1);
      return row as VersionVerificationRow;
    },
  };
}
