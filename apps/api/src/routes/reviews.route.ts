import type { FastifyInstance } from "fastify";
import {
  createReviewRequestSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  retractReviewRequestSchema,
  reviewSchema,
} from "@sourceit/shared";
import { createReviewsRepository } from "../repositories/reviews.repository";
import { createReviewersRepository } from "../repositories/reviewers.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createAuthorization } from "../auth/can";
import { createReviewsService } from "../services/reviews.service";

// GET  /versions/{versionId}/reviews  — public (ReviewerNotes.tsx)
// POST /versions/{versionId}/reviews  — authed, approved non-affiliated reviewer
// POST /reviews/{reviewId}/retract    — authed, only the review's author
export function registerReviewRoutes(app: FastifyInstance) {
  const reviewersRepo = createReviewersRepository(app.db);
  const repo = createReviewsRepository(app.db);
  const authz = createAuthorization(createPublishersRepository(app.db), reviewersRepo);
  const service = createReviewsService(repo, reviewersRepo, authz);

  app.get<{ Params: { versionId: string } }>("/versions/:versionId/reviews", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listReviews(request.params.versionId, query.cursor, query.limit);
    return paginatedResponseSchema(reviewSchema).parse(result);
  });

  app.post<{ Params: { versionId: string } }>(
    "/versions/:versionId/reviews",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const body = createReviewRequestSchema.parse(request.body);
      const created = await service.createReview(request.actor!, request.params.versionId, body);
      reply.status(201);
      return reviewSchema.parse(created);
    },
  );

  app.post<{ Params: { reviewId: string } }>(
    "/reviews/:reviewId/retract",
    { preHandler: app.requireActor },
    async (request) => {
      const body = retractReviewRequestSchema.parse(request.body);
      const updated = await service.retractReview(request.actor!, request.params.reviewId, body.reason);
      return reviewSchema.parse(updated);
    },
  );
}
