import type { FastifyInstance } from "fastify";
import {
  disputeSchema,
  fileDisputeRequestSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  resolveDisputeRequestSchema,
  respondToDisputeRequestSchema,
} from "@sourceit/shared";
import { createDisputesRepository } from "../repositories/disputes.repository";
import { createReviewersRepository } from "../repositories/reviewers.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createVerificationRepository } from "../repositories/verification.repository";
import { createPublisherDashboardRepository } from "../repositories/publisherDashboard.repository";
import { createAuthorization } from "../auth/can";
import { createDisputesService } from "../services/disputes.service";
import { createPublisherEventRecorder } from "../services/publisherEvents";

// GET  /versions/{versionId}/disputes  — public
// POST /versions/{versionId}/disputes  — authed, approved non-affiliated reviewer
// GET  /disputes/{disputeId}           — public, full event history
// POST /disputes/{disputeId}/respond   — authed, member of the disputed publisher
// POST /disputes/{disputeId}/resolve   — authed, the filer (withdraw) or filer/admin (resolve)
export function registerDisputeRoutes(app: FastifyInstance) {
  const reviewersRepo = createReviewersRepository(app.db);
  const repo = createDisputesRepository(app.db);
  const authz = createAuthorization(createPublishersRepository(app.db), reviewersRepo);
  const events = createPublisherEventRecorder(
    createPublisherDashboardRepository(app.db),
    createVerificationRepository(app.db),
  );
  const service = createDisputesService(repo, reviewersRepo, authz, events);

  app.get<{ Params: { versionId: string } }>("/versions/:versionId/disputes", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await service.listDisputes(request.params.versionId, query.cursor, query.limit);
    return paginatedResponseSchema(disputeSchema).parse(result);
  });

  app.post<{ Params: { versionId: string } }>(
    "/versions/:versionId/disputes",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const body = fileDisputeRequestSchema.parse(request.body);
      const created = await service.fileDispute(request.actor!, request.params.versionId, body);
      reply.status(201);
      return disputeSchema.parse(created);
    },
  );

  app.get<{ Params: { disputeId: string } }>("/disputes/:disputeId", async (request) => {
    const dispute = await service.getDispute(request.params.disputeId);
    return disputeSchema.parse(dispute);
  });

  app.post<{ Params: { disputeId: string } }>(
    "/disputes/:disputeId/respond",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const body = respondToDisputeRequestSchema.parse(request.body);
      const updated = await service.respondToDispute(request.actor!, request.params.disputeId, body);
      reply.status(201);
      return disputeSchema.parse(updated);
    },
  );

  app.post<{ Params: { disputeId: string } }>(
    "/disputes/:disputeId/resolve",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const body = resolveDisputeRequestSchema.parse(request.body);
      const updated = await service.resolveDispute(request.actor!, request.params.disputeId, body);
      reply.status(201);
      return disputeSchema.parse(updated);
    },
  );
}
