import type { FastifyInstance } from "fastify";
import {
  paginatedResponseSchema,
  paginationQuerySchema,
  publisherSchema,
  reviewerDecisionRequestSchema,
  reviewerSchema,
  verifyPublisherRequestSchema,
} from "@sourceit/shared";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createReviewersRepository } from "../repositories/reviewers.repository";
import { createAuthorization } from "../auth/can";
import { createAdminService } from "../services/admin.service";

// The two admin queues and their decision endpoints — all admin-role only.
// GET  /publishers/pending-verification
// POST /publishers/{publisherId}/verification   { decision: "verified" | "rejected" }
// GET  /reviewers/pending
// POST /reviewers/{reviewerId}/decision         { decision: "approved" | "rejected" }
export function registerAdminRoutes(app: FastifyInstance) {
  const publishersRepo = createPublishersRepository(app.db);
  const reviewersRepo = createReviewersRepository(app.db);
  const authz = createAuthorization(publishersRepo, reviewersRepo);
  const service = createAdminService(publishersRepo, reviewersRepo, authz);

  app.get("/publishers/pending-verification", { preHandler: app.requireActor }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listPendingPublishers(request.actor!, query.cursor, query.limit);
    return paginatedResponseSchema(publisherSchema).parse(result);
  });

  app.post<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/verification",
    { preHandler: app.requireActor },
    async (request) => {
      const body = verifyPublisherRequestSchema.parse(request.body);
      const updated = await service.decidePublisher(request.actor!, request.params.publisherId, body.decision);
      return publisherSchema.parse(updated);
    },
  );

  app.get("/reviewers/pending", { preHandler: app.requireActor }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listPendingReviewers(request.actor!, query.cursor, query.limit);
    return paginatedResponseSchema(reviewerSchema).parse(result);
  });

  app.post<{ Params: { reviewerId: string } }>(
    "/reviewers/:reviewerId/decision",
    { preHandler: app.requireActor },
    async (request) => {
      const body = reviewerDecisionRequestSchema.parse(request.body);
      const updated = await service.decideReviewer(request.actor!, request.params.reviewerId, body.decision);
      return reviewerSchema.parse(updated);
    },
  );
}
