import type { FastifyInstance } from "fastify";
import { versionVerificationSchema } from "@sourceit/shared";
import { createReviewsRepository } from "../repositories/reviews.repository";
import { createReviewersRepository } from "../repositories/reviewers.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createVersionVerificationsRepository } from "../repositories/versionVerifications.repository";
import { createVerificationRepository } from "../repositories/verification.repository";
import { createPublisherDashboardRepository } from "../repositories/publisherDashboard.repository";
import { createAuthorization } from "../auth/can";
import { createVersionVerificationService } from "../services/versionVerification.service";
import { createPublisherEventRecorder } from "../services/publisherEvents";

// POST /versions/{versionId}/verify — authed, approved non-affiliated reviewer.
// The `verified` trust status originates here; article_versions.review_status is
// never UPDATEd.
export function registerVersionVerificationRoute(app: FastifyInstance) {
  const reviewersRepo = createReviewersRepository(app.db);
  const authz = createAuthorization(createPublishersRepository(app.db), reviewersRepo);
  const events = createPublisherEventRecorder(
    createPublisherDashboardRepository(app.db),
    createVerificationRepository(app.db),
  );
  const service = createVersionVerificationService(
    createVersionVerificationsRepository(app.db),
    createReviewsRepository(app.db),
    reviewersRepo,
    authz,
    events,
  );

  app.post<{ Params: { versionId: string } }>(
    "/versions/:versionId/verify",
    { preHandler: app.requireActor },
    async (request, reply) => {
      const created = await service.verifyVersion(request.actor!, request.params.versionId);
      reply.status(201);
      return versionVerificationSchema.parse(created);
    },
  );
}
