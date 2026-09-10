import { randomUUID } from "node:crypto";
import { ConflictError } from "../errors";
import { toApiPublisher, toApiReviewer } from "./admin.service";
import type { createAccountsRepository } from "../repositories/accounts.repository";
import type { createPublishersRepository } from "../repositories/publishers.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";

type AccountsRepo = ReturnType<typeof createAccountsRepository>;
type PublishersRepo = ReturnType<typeof createPublishersRepository>;
type ReviewersRepo = ReturnType<typeof createReviewersRepository>;

export interface CreatePublisherInput {
  fullName: string;
  email: string;
  organizationName: string;
  website: string;
  description: string;
}

export interface ApplyAsReviewerInput {
  fullName: string;
  email: string;
  affiliation: string;
  expertise: string;
  applicationReason: string;
}

export function createRegistrationService(
  accountsRepo: AccountsRepo,
  publishersRepo: PublishersRepo,
  reviewersRepo: ReviewersRepo,
) {
  // Materialize the caller's accounts mirror row (idempotent on clerkUserId).
  // If the email is already registered to a *different* Clerk user, that is a
  // conflict — one email, one account.
  async function ensureCallerAccount(
    clerkUserId: string,
    email: string,
    fullName: string,
    role: "publisher" | "reviewer",
  ) {
    const byEmail = await accountsRepo.findByEmail(email);
    if (byEmail && byEmail.clerkUserId !== clerkUserId) {
      throw new ConflictError("That email is already registered to a different account");
    }
    return accountsRepo.ensureAccount({ clerkUserId, email, fullName, role });
  }

  return {
    // POST /publishers — session only (no local account required yet). Creates
    // the publisher (verificationStatus defaults to `unverified`) with a
    // placeholder clerk_org_id — real Clerk Organization sync is deferred
    // behind that column, same call Sprints 4/5 made for other externals — and
    // adds the caller as an `owner` member. A person may own more than one
    // publisher, so there is no conflict on a second call.
    async registerPublisher(clerkUserId: string, input: CreatePublisherInput) {
      const account = await ensureCallerAccount(clerkUserId, input.email, input.fullName, "publisher");

      const publisher = await publishersRepo.createPublisher({
        clerkOrgId: `local_org_${randomUUID()}`,
        organizationName: input.organizationName,
        displayName: input.organizationName,
        website: input.website,
        description: input.description,
      });
      await publishersRepo.addMember({ publisherId: publisher.id, accountId: account.id, role: "owner" });

      return toApiPublisher(publisher);
    },

    // POST /reviewers/apply — session only. One reviewer profile per account;
    // a second application is a 409.
    async applyAsReviewer(clerkUserId: string, input: ApplyAsReviewerInput) {
      const account = await ensureCallerAccount(clerkUserId, input.email, input.fullName, "reviewer");

      if (await reviewersRepo.findByAccountId(account.id)) {
        throw new ConflictError("This account has already applied to be a reviewer");
      }

      const reviewer = await reviewersRepo.createReviewer({
        accountId: account.id,
        affiliation: input.affiliation,
        expertise: input.expertise,
        applicationReason: input.applicationReason,
      });

      return toApiReviewer(reviewer);
    },
  };
}
