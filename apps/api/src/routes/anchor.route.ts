import type { FastifyInstance } from "fastify";
import { anchorRecordSchema } from "@sourceit/shared";
import { createAnchorRepository } from "../repositories/anchor.repository";
import { createAnchorService } from "../services/anchor.service";

// GET /versions/{versionId}/anchor — packages/shared/openapi.json's
// Verification tag. Public and unauthenticated like verification itself; once
// anchored, the response carries everything needed to verify the inclusion
// proof offline against the chain (see docs/ANCHORING.md).
export function registerAnchorRoute(app: FastifyInstance) {
  const repo = createAnchorRepository(app.db);
  const service = createAnchorService(repo);

  app.get<{ Params: { versionId: string } }>("/versions/:versionId/anchor", async (request) => {
    const result = await service.getAnchorForVersion(request.params.versionId);
    return anchorRecordSchema.parse(result);
  });
}
