import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthenticatedError } from "../errors";

declare module "fastify" {
  interface FastifyInstance {
    verifySession: import("./verifySession").SessionVerifier;
  }
  interface FastifyRequest {
    auth?: { clerkUserId: string };
  }
}

// preHandler for every authed route in packages/shared/openapi.json (security:
// authed). Reads and verifies the bearer token via the instance's decorated
// `verifySession` (real Clerk in production, a fake in tests — see
// src/auth/verifySession.ts) and attaches the result to `request.auth`.
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const result = await request.server.verifySession(request.headers.authorization);
  if (!result) throw new UnauthenticatedError();
  request.auth = result;
}
