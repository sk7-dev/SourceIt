import { ForbiddenError } from "../errors";
import type { createPublishersRepository } from "../repositories/publishers.repository";

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
  | { type: "article:archive"; publisherId: string };

export function createAuthorization(publishersRepo: ReturnType<typeof createPublishersRepository>) {
  async function can(actor: Actor, action: Action): Promise<boolean> {
    switch (action.type) {
      case "article:createDraft":
      case "article:writeDraft":
      case "article:archive":
        return publishersRepo.isMember(action.publisherId, actor.accountId);
      case "article:submit": {
        const isMember = await publishersRepo.isMember(action.publisherId, actor.accountId);
        if (!isMember) return false;
        return publishersRepo.isVerified(action.publisherId);
      }
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
    default:
      return "Only a member of this publisher can do that";
  }
}
