import type { FastifyInstance } from "fastify";
import {
  createPublisherFollowRequestSchema,
  createSavedArticleRequestSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  publisherFollowSchema,
  savedArticleSchema,
} from "@sourceit/shared";
import { createReaderRepository } from "../repositories/reader.repository";
import { createVerificationRepository } from "../repositories/verification.repository";
import { createReaderService } from "../services/reader.service";

// The reader's own saved articles and publisher follows (SavedArticles.tsx,
// TrustedPublishers.tsx). Every route needs a real account (`requireActor`) —
// the row is materialized by POST /readers at registration.
export function registerReaderRoutes(app: FastifyInstance) {
  const service = createReaderService(
    createReaderRepository(app.db),
    createVerificationRepository(app.db),
  );

  app.get("/saved-articles", { preHandler: app.requireActor }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listSavedArticles(request.actor!, query.cursor, query.limit);
    return paginatedResponseSchema(savedArticleSchema).parse(result);
  });

  app.post("/saved-articles", { preHandler: app.requireActor }, async (request, reply) => {
    const body = createSavedArticleRequestSchema.parse(request.body);
    const created = await service.saveArticle(request.actor!, body.articleId);
    reply.status(201);
    return savedArticleSchema.parse(created);
  });

  app.delete<{ Params: { savedArticleId: string } }>(
    "/saved-articles/:savedArticleId",
    { preHandler: app.requireActor },
    async (request, reply) => {
      await service.unsaveArticle(request.actor!, request.params.savedArticleId);
      reply.status(204);
    },
  );

  app.get("/publisher-follows", { preHandler: app.requireActor }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listFollows(request.actor!, query.cursor, query.limit);
    return paginatedResponseSchema(publisherFollowSchema).parse(result);
  });

  app.post("/publisher-follows", { preHandler: app.requireActor }, async (request, reply) => {
    const body = createPublisherFollowRequestSchema.parse(request.body);
    const created = await service.followPublisher(request.actor!, body.publisherId);
    reply.status(201);
    return publisherFollowSchema.parse(created);
  });

  app.delete<{ Params: { followId: string } }>(
    "/publisher-follows/:followId",
    { preHandler: app.requireActor },
    async (request, reply) => {
      await service.unfollowPublisher(request.actor!, request.params.followId);
      reply.status(204);
    },
  );
}
