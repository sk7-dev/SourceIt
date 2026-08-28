import type { FastifyInstance } from "fastify";
import { articleVersionSummarySchema, paginatedResponseSchema, paginationQuerySchema } from "@sourceit/shared";
import { createArticlesRepository } from "../repositories/articles.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createAuthorization } from "../auth/can";
import { createArticlesService } from "../services/articles.service";

export function registerPublisherArticlesRoute(app: FastifyInstance) {
  const articlesRepo = createArticlesRepository(app.db);
  const publishersRepo = createPublishersRepository(app.db);
  const authz = createAuthorization(publishersRepo);
  const service = createArticlesService(articlesRepo, authz);

  app.get<{ Params: { publisherId: string } }>(
    "/publishers/:publisherId/articles",
    { preHandler: app.requireActor },
    async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const result = await service.listForPublisher(request.actor!, request.params.publisherId, query.cursor, query.limit);
      return paginatedResponseSchema(articleVersionSummarySchema).parse(result);
    },
  );
}
