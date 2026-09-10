import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type {
  createDisputesRepository,
  DisputeEventRow,
  DisputeRow,
} from "../repositories/disputes.repository";
import type { createReviewersRepository } from "../repositories/reviewers.repository";
import type { PublisherEventRecorder } from "./publisherEvents";

type DisputesRepo = ReturnType<typeof createDisputesRepository>;
type ReviewersRepo = ReturnType<typeof createReviewersRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

const TERMINAL = new Set(["withdrawn", "resolved_corrected", "resolved_addressed_no_verdict"]);

function statusOf(events: DisputeEventRow[]): string {
  return events.length > 0 ? events[events.length - 1]!.eventType : "open";
}

export function toApiDispute(dispute: DisputeRow, events: DisputeEventRow[]) {
  const displayName =
    !dispute.filerUseLegalName && dispute.filerPseudonym ? dispute.filerPseudonym : dispute.filerFullName;
  return {
    id: dispute.id,
    articleVersionId: dispute.articleVersionId,
    filedBy: { id: dispute.filerReviewerId, displayName, title: dispute.filerTitle },
    reason: dispute.reason,
    status: statusOf(events),
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      note: e.note,
      correctionVersionId: e.correctionVersionId,
      createdAt: e.createdAt.toISOString(),
    })),
    createdAt: dispute.createdAt.toISOString(),
  };
}

export interface FileDisputeInput {
  reason: string;
}
export interface RespondInput {
  note?: string;
  correctionVersionId?: string;
}
export interface ResolveInput {
  eventType: "withdrawn" | "resolved_corrected" | "resolved_addressed_no_verdict";
  note?: string;
}

export function createDisputesService(
  repo: DisputesRepo,
  reviewersRepo: ReviewersRepo,
  authz: Authorization,
  recorder: PublisherEventRecorder,
) {
  async function loadApiDispute(disputeId: string) {
    const dispute = await repo.findDisputeById(disputeId);
    if (!dispute) throw new NotFoundError("Dispute not found");
    const events = await repo.listEvents(disputeId);
    return { dispute, events, api: toApiDispute(dispute, events) };
  }

  return {
    // GET /versions/{versionId}/disputes — public. A draft version is not
    // public, so its disputes 404 (existence not leaked).
    async listDisputes(versionId: string, cursor: string | undefined, limit: number) {
      const version = await repo.findVersionWithPublisher(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }
      const { items, nextCursor } = await repo.listDisputes(versionId, cursor, limit);
      const eventsByDispute = new Map<string, DisputeEventRow[]>();
      for (const e of await repo.listEventsForDisputes(items.map((d) => d.id))) {
        const bucket = eventsByDispute.get(e.disputeId);
        if (bucket) bucket.push(e);
        else eventsByDispute.set(e.disputeId, [e]);
      }
      return {
        items: items.map((d) => toApiDispute(d, eventsByDispute.get(d.id) ?? [])),
        nextCursor,
      };
    },

    // GET /disputes/{disputeId} — public, full event history.
    async getDispute(disputeId: string) {
      const { api } = await loadApiDispute(disputeId);
      return api;
    },

    // POST /versions/{versionId}/disputes — an approved reviewer with no
    // structural affiliation to the publisher (enforced in `can`). Disputes
    // attach to published versions only.
    async fileDispute(actor: Actor, versionId: string, input: FileDisputeInput) {
      const version = await repo.findVersionWithPublisher(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }

      await authz.assertCan(actor, { type: "dispute:file", publisherId: version.publisherId });

      const reviewer = await reviewersRepo.findByAccountId(actor.accountId);
      if (!reviewer) throw new ForbiddenError("Only an approved reviewer can dispute articles");

      const dispute = await repo.createDispute({
        articleVersionId: versionId,
        filedByReviewerId: reviewer.id,
        reason: input.reason,
      });
      await recorder.recordActivity({
        publisherId: version.publisherId,
        type: "dispute_filed",
        title: "A dispute was filed against a published version",
        articleId: version.articleId,
        articleVersionId: versionId,
      });
      await recorder.recordCredibilitySnapshot(version.publisherId);
      return toApiDispute(dispute, []);
    },

    // POST /disputes/{disputeId}/respond — a member of the disputed publisher
    // appends a `publisher_responded` event: free text, a correction version,
    // or both. Never resolves, withdraws, or hides the dispute.
    async respondToDispute(actor: Actor, disputeId: string, input: RespondInput) {
      const context = await repo.findDisputeContext(disputeId);
      if (!context) throw new NotFoundError("Dispute not found");

      await authz.assertCan(actor, { type: "dispute:respond", publisherId: context.publisherId });

      if (TERMINAL.has(statusOf(await repo.listEvents(disputeId)))) {
        throw new ConflictError("This dispute is closed and cannot be responded to");
      }

      if (input.correctionVersionId !== undefined) {
        const correction = await repo.findVersionInArticle(input.correctionVersionId, context.articleId);
        if (!correction) {
          throw new ValidationError("correctionVersionId must be a version of the disputed article", [
            { field: "correctionVersionId", message: "not a version of this article" },
          ]);
        }
        if (correction.reviewStatus === "draft") {
          throw new ValidationError("A correction version must be published, not a draft", [
            { field: "correctionVersionId", message: "version is still a draft" },
          ]);
        }
      }

      await repo.appendEvent({
        disputeId,
        eventType: "publisher_responded",
        note: input.note ?? null,
        correctionVersionId: input.correctionVersionId ?? null,
        actorAccountId: actor.accountId,
      });
      return (await loadApiDispute(disputeId)).api;
    },

    // POST /disputes/{disputeId}/resolve — the filer withdraws, or the filer
    // or a site admin marks it resolved. Never the publisher. Procedural, not a
    // truth verdict.
    async resolveDispute(actor: Actor, disputeId: string, input: ResolveInput) {
      const { dispute, events } = await loadApiDispute(disputeId);

      if (input.eventType === "withdrawn") {
        await authz.assertCan(actor, { type: "dispute:withdraw", filerAccountId: dispute.filerAccountId });
      } else {
        await authz.assertCan(actor, { type: "dispute:resolve", filerAccountId: dispute.filerAccountId });
      }

      if (TERMINAL.has(statusOf(events))) {
        throw new ConflictError("This dispute is already closed");
      }

      await repo.appendEvent({
        disputeId,
        eventType: input.eventType,
        note: input.note ?? null,
        correctionVersionId: null,
        actorAccountId: actor.accountId,
      });
      // The dispute is now closed — the publisher's open-dispute count dropped.
      const context = await repo.findDisputeContext(disputeId);
      if (context) await recorder.recordCredibilitySnapshot(context.publisherId);
      return (await loadApiDispute(disputeId)).api;
    },
  };
}
