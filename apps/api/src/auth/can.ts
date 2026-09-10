import { ForbiddenError } from "../errors";
import type { createPublishersRepository } from "../repositories/publishers.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";

export interface Actor {
  accountId: string;
  // The account's role, resolved by requireActor/resolveOptionalActor. Only
  // dispute:resolve needs it (a site admin may close a dispute the filer left
  // hanging).
  role: string;
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
  | { type: "review:retract"; reviewerAccountId: string }
  // Verifying a published version has the same gate as filing a review — an
  // approved reviewer with no structural affiliation to the publisher. One
  // verification moves the version to a `verified` trust output; a later dispute
  // outranks it (Sprint 11).
  | { type: "version:verify"; publisherId: string }
  // Filing a dispute has the same gate as a review — an approved reviewer with
  // no structural affiliation to the disputed publisher.
  | { type: "dispute:file"; publisherId: string }
  // Only a member of the disputed publisher may append a `publisher_responded`
  // event (free text and/or a correction). They can never resolve, withdraw,
  // or hide it (build prompt: "A publisher cannot suppress a dispute").
  | { type: "dispute:respond"; publisherId: string }
  // Withdrawing is the filer's alone; resolving is the filer's or a site
  // admin's — never the publisher's.
  | { type: "dispute:withdraw"; filerAccountId: string }
  | { type: "dispute:resolve"; filerAccountId: string }
  // Site-admin-only actions: the publisher-verification and reviewer-approval
  // queues and their decision endpoints. A plain role check — the `admin` role
  // was created for exactly these two queues (decision 2026-08-26).
  | { type: "admin" };

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
      case "dispute:respond":
        return publishersRepo.isMember(action.publisherId, actor.accountId);
      case "article:submit": {
        const isMember = await publishersRepo.isMember(action.publisherId, actor.accountId);
        if (!isMember) return false;
        return publishersRepo.isVerified(action.publisherId);
      }
      case "review:create":
      case "dispute:file":
      case "version:verify": {
        const reviewer = await reviewersRepo.findByAccountId(actor.accountId);
        if (!reviewer || reviewer.approvalStatus !== "approved") return false;
        const affiliated = await publishersRepo.isMember(action.publisherId, actor.accountId);
        return !affiliated;
      }
      case "review:retract":
        return action.reviewerAccountId === actor.accountId;
      case "dispute:withdraw":
        return action.filerAccountId === actor.accountId;
      case "dispute:resolve":
        return action.filerAccountId === actor.accountId || actor.role === "admin";
      case "admin":
        return actor.role === "admin";
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
    case "dispute:file":
      return "Only an approved reviewer with no affiliation to this publisher can dispute its articles";
    case "version:verify":
      return "Only an approved reviewer with no affiliation to this publisher can verify its versions";
    case "review:retract":
      return "Only the reviewer who wrote a review can retract it";
    case "dispute:withdraw":
      return "Only the reviewer who filed a dispute can withdraw it";
    case "dispute:resolve":
      return "Only the reviewer who filed a dispute, or a site admin, can resolve it";
    case "admin":
      return "Only a site admin can do that";
    default:
      return "Only a member of this publisher can do that";
  }
}
