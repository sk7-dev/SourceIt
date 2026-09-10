import type { FastifyInstance } from "fastify";
import { notFoundVerificationResultSchema, uuidSchema, verificationResultSchema } from "@sourceit/shared";
import { createVerificationRepository } from "../repositories/verification.repository";
import { createEvidenceRepository } from "../repositories/evidence.repository";
import { createReviewsRepository } from "../repositories/reviews.repository";
import { createAnchorRepository } from "../repositories/anchor.repository";
import { createVerificationService } from "../services/verification.service";

// GET /articles/{articleId}/verification — the composed public read the whole
// /verification-result page is built around. 404 body is special-shaped:
// `{ trustStatus: "notfound", queriedId? }`, never the generic error envelope.
export function registerVerificationRoute(app: FastifyInstance) {
  const service = createVerificationService(
    createVerificationRepository(app.db),
    createEvidenceRepository(app.db),
    createReviewsRepository(app.db),
    createAnchorRepository(app.db),
  );

  app.get<{ Params: { articleId: string } }>("/articles/:articleId/verification", async (request, reply) => {
    const { articleId } = request.params;
    const isUuid = uuidSchema.safeParse(articleId).success;

    const result = isUuid ? await service.getVerification(articleId) : null;
    if (!result) {
      reply.status(404);
      return notFoundVerificationResultSchema.parse(
        isUuid ? { trustStatus: "notfound", queriedId: articleId } : { trustStatus: "notfound" },
      );
    }
    return verificationResultSchema.parse(result);
  });
}
