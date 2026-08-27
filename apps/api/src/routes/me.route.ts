import type { FastifyInstance } from "fastify";
import { meResponseSchema } from "@sourceit/shared";
import { requireAuth } from "../auth/requireAuth";
import { createAccountsRepository } from "../repositories/accounts.repository";
import { createMeService } from "../services/me.service";

// GET /me — packages/shared/openapi.json's Session tag. The one endpoint
// Sprint 2 implements fully, to prove route → validate → service →
// repository → database works end to end.
export function registerMeRoute(app: FastifyInstance) {
  const accountsRepo = createAccountsRepository(app.db);
  const meService = createMeService(accountsRepo);

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    const result = await meService.getMe(request.auth!.clerkUserId);
    // Zod at every trust boundary — validated against the same schema
    // openapi.json was generated from, not just trusted to match.
    return meResponseSchema.parse(result);
  });
}
