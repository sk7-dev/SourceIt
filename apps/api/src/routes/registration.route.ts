import type { FastifyInstance } from "fastify";
import {
  applyAsReviewerRequestSchema,
  createPublisherRequestSchema,
  publisherSchema,
  reviewerSchema,
} from "@sourceit/shared";
import { requireAuth } from "../auth/requireAuth";
import { createAccountsRepository } from "../repositories/accounts.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createReviewersRepository } from "../repositories/reviewers.repository";
import { createRegistrationService } from "../services/registration.service";

// Self-service registration — POST /publishers and POST /reviewers/apply
// (RegisterForm.tsx). Session-only (`requireAuth`, not `requireActor`): a valid
// Clerk session is enough, and the caller's `accounts` mirror row is created on
// the spot if it does not exist yet.
export function registerRegistrationRoutes(app: FastifyInstance) {
  const service = createRegistrationService(
    createAccountsRepository(app.db),
    createPublishersRepository(app.db),
    createReviewersRepository(app.db),
  );

  app.post("/publishers", { preHandler: requireAuth }, async (request, reply) => {
    const body = createPublisherRequestSchema.parse(request.body);
    const created = await service.registerPublisher(request.auth!.clerkUserId, body);
    reply.status(201);
    return publisherSchema.parse(created);
  });

  app.post("/reviewers/apply", { preHandler: requireAuth }, async (request, reply) => {
    const body = applyAsReviewerRequestSchema.parse(request.body);
    const created = await service.applyAsReviewer(request.auth!.clerkUserId, body);
    reply.status(201);
    return reviewerSchema.parse(created);
  });
}
