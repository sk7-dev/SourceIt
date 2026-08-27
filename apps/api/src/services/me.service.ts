import { NotFoundError } from "../errors";
import type { createAccountsRepository } from "../repositories/accounts.repository";

// Services do no SQL — this composes repository calls only.
export function createMeService(accountsRepo: ReturnType<typeof createAccountsRepository>) {
  return {
    async getMe(clerkUserId: string) {
      const account = await accountsRepo.findByClerkUserId(clerkUserId);
      if (!account) {
        // A Clerk session can be valid before the local account row exists
        // (e.g. the Clerk↔accounts sync webhook hasn't landed yet) — treated
        // as not-found rather than crashing, per the standard 401/403/404
        // authorization test matrix.
        throw new NotFoundError("No SourceIt account for this session yet");
      }

      const [publisherIds, reviewerId] = await Promise.all([
        accountsRepo.findPublisherIdsForAccount(account.id),
        accountsRepo.findReviewerIdForAccount(account.id),
      ]);

      return {
        account: {
          id: account.id,
          email: account.email,
          fullName: account.fullName,
          role: account.role,
          createdAt: account.createdAt.toISOString(),
        },
        publisherIds,
        reviewerId,
      };
    },
  };
}
