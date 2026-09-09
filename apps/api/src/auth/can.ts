import { ForbiddenError } from "../errors";
import type { createPublishersRepository } from "../repositories/publishers.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";

export interface Actor {
  accountId: string;
}

// A single can(actor, action, resource) function — every handler that needs
// an authorization decision calls this, per the cross-cutting standard.
// Authorization never lives in a route conditional or implicitly in a WHERE
// clause.
export type Action =
  | { type: "article:createDraft"; publisherId: string }
  | { type: "article:submit"; publisherId: string }
  | { type: "article:writeDraft"; publisherId: string }
  | { type: "article:archive"; publisherId: string }
  | { type: "evidence:attach"; publisherId: string }
  // review:create takes the publisher whose article is being reviewed — an
  // approved reviewer structurally affiliated with it (a publisher_members row)
  // is denied (build prompt: "Conflict of interest is structural. Enforce it,
  // don't disclose it").
  | { type: "review:create"; publisherId: string }
  | { type: "review:retract"; reviewerAccountId: string };

export function createAuthorization(
  publishersRepo: ReturnType<typeof createPublishersRepository>,
  reviewersRepo: ReturnType<typeof createReviewersRepository>,
) {
  async function can(actor: Actor, action: Action): Promise<boolean> {
    switch (action.type) {
      case "article:createDraft":
      case "article:writeDraft":
      case "article:archive":
      case "evidence:attach":
        return publishersRepo.isMember(action.publisherId, actor.accountId);
      case "article:submit": {
        const isMember = await publishersRepo.isMember(action.publisherId, actor.accountId);
        if (!isMember) return false;
        return publishersRepo.isVerified(action.publisherId);
      }
      case "review:create": {
        const reviewer = await reviewersRepo.findByAccountId(actor.accountId);
        if (!reviewer || reviewer.approvalStatus !== "approved") return false;
        const affiliated = await publishersRepo.isMember(action.publisherId, actor.accountId);
        return !affiliated;
      }
      case "review:retract":
        return action.reviewerAccountId === actor.accountId;
    }
  }

  async function assertCan(actor: Actor, action: Action): Promise<void> {
    if (!(await can(actor, action))) {
      throw new ForbiddenError(describeDenial(action));
    }
  }

  return { can, assertCan };
}

function describeDenial(action: Action): string {
  switch (action.type) {
    case "article:submit":
      return "Only a member of a verified publisher can submit an article for publication";
    case "review:create":
      return "Only an approved reviewer with no affiliation to this publisher can review its articles";
    case "review:retract":
      return "Only the reviewer who wrote a review can retract it";
    default:
      return "Only a member of this publisher can do that";
  }
}
