import { verifyToken } from "@clerk/backend";
import { env } from "../env";

export type SessionVerifier = (
  authorizationHeader: string | undefined,
) => Promise<{ clerkUserId: string } | null>;

// Real verification against Clerk's session JWT (docs/STACK_PROPOSAL.md, auth:
// Clerk). Kept behind the `SessionVerifier` type — rather than called directly
// from route handlers — so integration tests can substitute a fake verifier
// (see test/testApp.ts) instead of needing a live Clerk project to exercise
// the rest of the request pipeline. The database in those tests is always
// real (Testcontainers Postgres); only this one external network dependency
// is swapped.
export const verifyClerkSession: SessionVerifier = async (authorizationHeader) => {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length);

  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return { clerkUserId: payload.sub };
  } catch {
    return null;
  }
};
