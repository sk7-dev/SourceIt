import type { FastifyInstance } from "fastify";
import {
  articleVersionSchema,
  createArticleRequestSchema,
  createArticleResponseSchema,
  createArticleVersionRequestSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
} from "@sourceit/shared";
import { createArticlesRepository } from "../repositories/articles.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createAuthorization } from "../auth/can";
import { createArticlesService } from "../services/articles.service";

export function registerArticleRoutes(app: FastifyInstance) {
  const articlesRepo = createArticlesRepository(app.db);
  const publishersRepo = createPublishersRepository(app.db);
  const authz = createAuthorization(publishersRepo);
  const service = createArticlesService(articlesRepo, authz);

  app.post("/articles", { preHandler: app.requireActor }, async (request, reply) => {
    const body = createArticleRequestSchema.parse(request.body);
    const result = await service.createArticle(request.actor!, body);
    reply.status(201);
    return createArticleResponseSchema.parse(result);
  });

  app.get<{ Params: { articleId: string } }>("/articles/:articleId", async (request) => {
    const article = await service.getArticle(request.params.articleId);
    return article;
  });

  app.get<{ Params: { articleId: string } }>("/articles/:articleId/versions", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listPublishedVersions(request.params.articleId, query.cursor, query.limit);
    return paginatedResponseSchema(articleVersionSchema).parse(result);
  });

  app.get<{ Params: { articleId: string; versionId: string } }>(
    "/articles/:articleId/versions/:versionId",
    { preHandler: app.resolveOptionalActor },
    async (request) => {
      const version = await service.getVersion(
        request.params.articleId,
        request.params.versionId,
        request.actor ?? null,
      );
      return version;
    },
  );

  app.post<{ Params: { articleId: string } }>(
    "/articles/:articleId/versions",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const body = createArticleVersionRequestSchema.parse(request.body);
      const version = await service.createVersion(request.actor!, request.params.articleId, body);
      reply.status(201);
      return articleVersionSchema.parse(version);
    },
  );

  app.patch<{ Params: { articleId: string; versionId: string } }>(
    "/articles/:articleId/versions/:versionId",
    { preHandler: app.requireActor },
    async (request) => {
      const body = createArticleVersionRequestSchema.parse(request.body);
      const version = await service.updateDraftVersion(
        request.actor!,
        request.params.articleId,
        request.params.versionId,
        body,
      );
      return articleVersionSchema.parse(version);
    },
  );

  app.delete<{ Params: { articleId: string; versionId: string } }>(
    "/articles/:articleId/versions/:versionId",
    { preHandler: app.requireActor },
    async (request, reply) => {
      await service.deleteDraftVersion(request.actor!, request.params.articleId, request.params.versionId);
      reply.status(204);
    },
  );

  app.post<{ Params: { articleId: string } }>(
    "/articles/:articleId/archive",
    { preHandler: app.requireActor },
    async (request) => {
      return service.archiveArticle(request.actor!, request.params.articleId);
    },
  );
}
