import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type { createReviewsRepository, ReviewRow } from "../repositories/reviews.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";
import type { PublisherEventRecorder } from "./publisherEvents";

type ReviewsRepo = ReturnType<typeof createReviewsRepository>;
type ReviewersRepo = ReturnType<typeof createReviewersRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

export interface CreateReviewInput {
  type: "confirmation" | "clarification" | "correction_note";
  comment: string;
}

// The public reviewer identity is a pseudonym when the reviewer chose one;
// accounts.fullName is never exposed here (build prompt / OPEN_QUESTIONS #10).
export function toApiReview(row: ReviewRow) {
  const displayName =
    !row.reviewerUseLegalName && row.reviewerPseudonym ? row.reviewerPseudonym : row.reviewerFullName;
  return {
    id: row.id,
    articleVersionId: row.articleVersionId,
    reviewer: { id: row.reviewerId, displayName, title: row.reviewerTitle },
    type: row.type,
    comment: row.comment,
    isRetracted: row.retractedAt !== null,
    retractedReason: row.retractedReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createReviewsService(
  repo: ReviewsRepo,
  reviewersRepo: ReviewersRepo,
  authz: Authorization,
  events: PublisherEventRecorder,
) {
  return {
    // GET /versions/{versionId}/reviews — public. A draft version is not
    // public, so its reviews 404 (existence not leaked), like anchor/evidence.
    async listReviews(versionId: string, cursor: string | undefined, limit: number) {
      const version = await repo.findVersionWithPublisher(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }
      const { items, nextCursor } = await repo.listReviews(versionId, cursor, limit);
      return { items: items.map(toApiReview), nextCursor };
    },

    // POST /versions/{versionId}/reviews — an approved reviewer with no
    // structural affiliation to the publisher (enforced in `can`). Reviews
    // attach to published versions only.
    async createReview(actor: Actor, versionId: string, input: CreateReviewInput) {
      const version = await repo.findVersionWithPublisher(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }

      await authz.assertCan(actor, { type: "review:create", publisherId: version.publisherId });

      // `can` proved the actor is an approved reviewer; fetch the id to attach.
      const reviewer = await reviewersRepo.findByAccountId(actor.accountId);
      if (!reviewer) throw new ForbiddenError("Only an approved reviewer can review articles");

      const row = await repo.createReview({
        articleVersionId: versionId,
        reviewerId: reviewer.id,
        type: input.type,
        comment: input.comment,
      });
      const api = toApiReview(row);
      await events.recordActivity({
        publisherId: version.publisherId,
        type: "review",
        title: `${api.reviewer.displayName} added a ${input.type.replace(/_/g, " ")}`,
        articleVersionId: versionId,
      });
      return api;
    },

    // POST /reviews/{reviewId}/retract — only the reviewer who wrote it. The
    // original review row is untouched; a review_retractions row is added.
    async retractReview(actor: Actor, reviewId: string, reason: string | undefined) {
      const review = await repo.findReviewById(reviewId);
      if (!review) throw new NotFoundError("Review not found");

      await authz.assertCan(actor, {
        type: "review:retract",
        reviewerAccountId: review.reviewerAccountId,
      });

      if (review.retractedAt !== null) {
        throw new ConflictError("This review has already been retracted");
      }

      const row = await repo.createRetraction({ reviewId, reason: reason ?? null });
      return toApiReview(row);
    },
  };
}
