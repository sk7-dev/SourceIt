import type { FastifyInstance } from "fastify";
import {
  activityEventSchema,
  credibilityBreakdownSchema,
  credibilityHistoryPointSchema,
  disputeSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  publisherAnalyticsSchema,
  publisherSchema,
  reviewSchema,
  z,
} from "@sourceit/shared";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createVerificationRepository } from "../repositories/verification.repository";
import { createPublisherDashboardRepository } from "../repositories/publisherDashboard.repository";
import { createPublisherDashboardService } from "../services/publisherDashboard.service";

// The publisher dashboard reads (PublisherProfileCard / AnalyticsCards /
// RecentActivity / CredibilityPanel / ReviewsDisputes). `/publishers/{id}`,
// `/credibility`, `/credibility-history` are public; `/analytics`, `/activity`,
// `/reviews` require any authenticated account.
export function registerPublisherRoutes(app: FastifyInstance) {
  const service = createPublisherDashboardService(
    createPublishersRepository(app.db),
    createVerificationRepository(app.db),
    createPublisherDashboardRepository(app.db),
  );

  app.get<{ Params: { publisherId: string } }>("/publishers/:publisherId", async (request) => {
    const result = await service.getPublisher(request.params.publisherId);
    return publisherSchema.parse(result);
  });

  app.get<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/analytics",
    { preHandler: app.requireActor },
    async (request) => {
      const result = await service.getAnalytics(request.params.publisherId);
      return publisherAnalyticsSchema.parse(result);
    },
  );

  app.get<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/activity",
    { preHandler: app.requireActor },
    async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const result = await service.getActivity(request.params.publisherId, query.cursor, query.limit);
      return paginatedResponseSchema(activityEventSchema).parse(result);
    },
  );

  app.get<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/reviews",
    { preHandler: app.requireActor },
    async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const result = await service.getReviewsAndDisputes(
        request.params.publisherId,
        query.cursor,
        query.limit,
      );
      return paginatedResponseSchema(z.union([reviewSchema, disputeSchema])).parse(result);
    },
  );

  app.get<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/credibility",
    async (request) => {
      const result = await service.getCredibility(request.params.publisherId);
      return credibilityBreakdownSchema.parse(result);
    },
  );

  app.get<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/credibility-history",
    async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const result = await service.getCredibilityHistory(
        request.params.publisherId,
        query.cursor,
        query.limit,
      );
      return paginatedResponseSchema(credibilityHistoryPointSchema).parse(result);
    },
  );
}
