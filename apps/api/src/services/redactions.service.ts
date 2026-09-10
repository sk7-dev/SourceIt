import { ConflictError, NotFoundError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type { createArticlesRepository } from "../repositories/articles.repository";
import type {
  createRedactionsRepository,
  RedactionTombstone,
} from "../repositories/redactions.repository";

type RedactionsRepo = ReturnType<typeof createRedactionsRepository>;
type ArticlesRepo = ReturnType<typeof createArticlesRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

export interface CreateRedactionInput {
  category: string;
  reason: string;
}

export function toApiRedaction(row: RedactionTombstone) {
  return {
    articleVersionId: row.articleVersionId,
    category: row.category,
    tombstoneHash: row.tombstoneHash,
    redactedAt: row.redactedAt.toISOString(),
  };
}

export function createRedactionsService(
  repo: RedactionsRepo,
  articlesRepo: ArticlesRepo,
  authz: Authorization,
) {
  return {
    // GET /versions/{versionId}/redaction — public. The tombstone or a 404; the
    // legal `reason` is never in this response.
    async getRedaction(versionId: string) {
      const row = await repo.findByVersionId(versionId);
      if (!row) throw new NotFoundError("This version is not redacted");
      return toApiRedaction(row);
    },

    // POST /versions/{versionId}/redaction — admin only (legal takedown).
    // Redaction is suppression at the read layer: no write touches
    // article_versions. The tombstone's hash is the version's own anchored
    // contentHash, so a skeptic can still check "a document with this
    // fingerprint was anchored at this time" against the chain.
    async redactVersion(actor: Actor, versionId: string, input: CreateRedactionInput) {
      await authz.assertCan(actor, { type: "admin" });

      const version = await articlesRepo.findVersionById(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }

      if (await repo.findByVersionId(versionId)) {
        throw new ConflictError("This version is already redacted");
      }

      const row = await repo.create({
        articleVersionId: versionId,
        category: input.category,
        reason: input.reason,
        // A non-draft version always has its contentHash set (at submit time).
        tombstoneHash: version.contentHash ?? "",
        redactedByAccountId: actor.accountId,
      });
      return toApiRedaction(row);
    },
  };
}
