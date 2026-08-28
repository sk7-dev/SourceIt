import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthenticatedError } from "../errors";
import type { createAccountsRepository } from "../repositories/accounts.repository";
import type { Actor } from "./can";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor;
  }
}

// Verifies the session (via the instance's decorated verifySession — real
// Clerk in production, a fake in tests) *and* resolves it to a local account
// row, attaching { accountId } as request.actor for every write endpoint's
// authorization checks (src/auth/can.ts). A valid Clerk session with no
// matching local account is treated the same as no session at all — this app
// has nothing to authorize against otherwise.
export function createRequireActor(accountsRepo: ReturnType<typeof createAccountsRepository>) {
  return async function requireActor(request: FastifyRequest, _reply: FastifyReply) {
    const session = await request.server.verifySession(request.headers.authorization);
    if (!session) throw new UnauthenticatedError();

    const account = await accountsRepo.findByClerkUserId(session.clerkUserId);
    if (!account) throw new UnauthenticatedError("No SourceIt account for this session");

    request.actor = { accountId: account.id };
  };
}

// Same resolution, but never throws — for routes that are public but behave
// differently for an authenticated owner (e.g. a draft version is invisible
// to the public but visible to its own publisher's members).
export function createResolveOptionalActor(accountsRepo: ReturnType<typeof createAccountsRepository>) {
  return async function resolveOptionalActor(request: FastifyRequest, _reply: FastifyReply) {
    const session = await request.server.verifySession(request.headers.authorization).catch(() => null);
    if (!session) return;
    const account = await accountsRepo.findByClerkUserId(session.clerkUserId);
    if (account) request.actor = { accountId: account.id };
  };
}
