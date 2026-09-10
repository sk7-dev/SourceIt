import type { FastifyInstance } from "fastify";
import { createRedactionRequestSchema, redactionSchema } from "@sourceit/shared";
import { createArticlesRepository } from "../repositories/articles.repository";
import { createRedactionsRepository } from "../repositories/redactions.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createReviewersRepository } from "../repositories/reviewers.repository";
import { createAuthorization } from "../auth/can";
import { createRedactionsService } from "../services/redactions.service";

// GET  /versions/{versionId}/redaction  — public tombstone (or 404)
// POST /versions/{versionId}/redaction  — admin only, legal takedown
export function registerRedactionRoutes(app: FastifyInstance) {
  const authz = createAuthorization(
    createPublishersRepository(app.db),
    createReviewersRepository(app.db),
  );
  const service = createRedactionsService(
    createRedactionsRepository(app.db),
    createArticlesRepository(app.db),
    authz,
  );

  app.get<{ Params: { versionId: string } }>("/versions/:versionId/redaction", async (request) => {
    const result = await service.getRedaction(request.params.versionId);
    return redactionSchema.parse(result);
  });

  app.post<{ Params: { versionId: string } }>(
    "/versions/:versionId/redaction",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const body = createRedactionRequestSchema.parse(request.body);
      const result = await service.redactVersion(request.actor!, request.params.versionId, body);
      reply.status(201);
      return redactionSchema.parse(result);
    },
  );
}
