import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type { createReviewsRepository } from "../repositories/reviews.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";
import type {
  createVersionVerificationsRepository,
  VersionVerificationRow,
} from "../repositories/versionVerifications.repository";
import type { PublisherEventRecorder } from "./publisherEvents";

type VerificationsRepo = ReturnType<typeof createVersionVerificationsRepository>;
type ReviewsRepo = ReturnType<typeof createReviewsRepository>;
type ReviewersRepo = ReturnType<typeof createReviewersRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

// Same pseudonym-aware derivation as toApiReview — accounts.fullName is never
// the public displayName when the reviewer chose a pseudonym.
export function toApiVersionVerification(row: VersionVerificationRow) {
  const displayName =
    !row.reviewerUseLegalName && row.reviewerPseudonym ? row.reviewerPseudonym : row.reviewerFullName;
  return {
    id: row.id,
    articleVersionId: row.articleVersionId,
    verifiedBy: { id: row.reviewerId, displayName, title: row.reviewerTitle },
    createdAt: row.createdAt.toISOString(),
  };
}

export function createVersionVerificationService(
  repo: VerificationsRepo,
  reviewsRepo: ReviewsRepo,
  reviewersRepo: ReviewersRepo,
  authz: Authorization,
  events: PublisherEventRecorder,
) {
  return {
    // POST /versions/{versionId}/verify — an approved reviewer with no
    // structural affiliation to the publisher (enforced in `can`). Attaches to
    // published versions only; append-only; once per version.
    async verifyVersion(actor: Actor, versionId: string) {
      const version = await reviewsRepo.findVersionWithPublisher(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }

      await authz.assertCan(actor, { type: "version:verify", publisherId: version.publisherId });

      // `can` proved the actor is an approved reviewer; fetch the id to attach.
      const reviewer = await reviewersRepo.findByAccountId(actor.accountId);
      if (!reviewer) throw new ForbiddenError("Only an approved reviewer can verify versions");

      if (await repo.findByVersionId(versionId)) {
        throw new ConflictError("This version has already been verified");
      }

      const row = await repo.create({ articleVersionId: versionId, reviewerId: reviewer.id });
      await events.recordCredibilitySnapshot(version.publisherId);
      return toApiVersionVerification(row);
    },
  };
}
