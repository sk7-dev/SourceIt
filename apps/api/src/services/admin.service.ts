import { NotFoundError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type { createPublishersRepository } from "../repositories/publishers.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";

type PublishersRepo = ReturnType<typeof createPublishersRepository>;
type ReviewersRepo = ReturnType<typeof createReviewersRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

// The stored credibility_score / transparency_level columns (not the read-time
// computation the verification endpoint does) — the admin queue is not the
// place to recompute a publisher-wide aggregate.
export function toApiPublisher(row: {
  id: string;
  organizationName: string;
  displayName: string;
  website: string;
  description: string;
  categories: string[] | null;
  verificationStatus: string;
  transparencyLevel: number;
  credibilityScore: number;
  createdAt: Date;
}) {
  return {
    id: row.id,
    organizationName: row.organizationName,
    displayName: row.displayName,
    website: row.website,
    description: row.description,
    categories: row.categories,
    verificationStatus: row.verificationStatus,
    transparencyLevel: row.transparencyLevel,
    credibilityScore: row.credibilityScore,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toApiReviewer(row: {
  id: string;
  affiliation: string;
  expertise: string;
  title: string | null;
  pseudonym: string | null;
  useLegalName: boolean;
  approvalStatus: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    affiliation: row.affiliation,
    expertise: row.expertise,
    title: row.title,
    pseudonym: row.pseudonym,
    useLegalName: row.useLegalName,
    approvalStatus: row.approvalStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAdminService(
  publishersRepo: PublishersRepo,
  reviewersRepo: ReviewersRepo,
  authz: Authorization,
) {
  return {
    async listPendingPublishers(actor: Actor, cursor: string | undefined, limit: number) {
      await authz.assertCan(actor, { type: "admin" });
      const { items, nextCursor } = await publishersRepo.listByStatus("pending", cursor, limit);
      return { items: items.map(toApiPublisher), nextCursor };
    },

    // Approve or reject a publisher's verification. Permissive on the current
    // state — an admin may verify a pending publisher, reject an application, or
    // revoke a previously-granted verification; only an unknown id is a 404.
    async decidePublisher(actor: Actor, publisherId: string, decision: "verified" | "rejected") {
      await authz.assertCan(actor, { type: "admin" });
      const updated = await publishersRepo.setVerification(publisherId, decision, actor.accountId);
      if (!updated) throw new NotFoundError("Publisher not found");
      return toApiPublisher(updated);
    },

    async listPendingReviewers(actor: Actor, cursor: string | undefined, limit: number) {
      await authz.assertCan(actor, { type: "admin" });
      const { items, nextCursor } = await reviewersRepo.listByStatus("pending", cursor, limit);
      return { items: items.map(toApiReviewer), nextCursor };
    },

    async decideReviewer(actor: Actor, reviewerId: string, decision: "approved" | "rejected") {
      await authz.assertCan(actor, { type: "admin" });
      const updated = await reviewersRepo.setApproval(reviewerId, decision, actor.accountId);
      if (!updated) throw new NotFoundError("Reviewer not found");
      return toApiReviewer(updated);
    },
  };
}
