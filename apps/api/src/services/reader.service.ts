import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { computeCredibility, deriveTrustStatus, type TrustStatus } from "./trust";
import type { Actor } from "../auth/can";
import type { createReaderRepository } from "../repositories/reader.repository";
import type { createVerificationRepository } from "../repositories/verification.repository";

type ReaderRepo = ReturnType<typeof createReaderRepository>;
type VerificationRepo = ReturnType<typeof createVerificationRepository>;

type SavedRow = { id: string; articleId: string; savedAt: Date; archivedAt: Date | null; publisherName: string };
type FollowRow = {
  id: string;
  publisherId: string;
  createdAt: Date;
  publisherName: string;
  verificationStatus: string;
};

export function createReaderService(repo: ReaderRepo, verificationRepo: VerificationRepo) {
  // Denormalize a page of saved rows into savedArticleSchema. The per-row
  // trustStatus uses the same read-time derivation as
  // GET /articles/{id}/verification, batched over the page so there is no N+1.
  // A saved article whose underlying article is archived or has no published
  // version is dropped from the result (its bookmark row still exists and can
  // be deleted by id).
  async function toApiSavedArticles(rows: SavedRow[]) {
    const live = rows.filter((r) => r.archivedAt === null);
    const currentByArticle = await repo.currentVersionsForArticles(live.map((r) => r.articleId));

    const versionIds = [...currentByArticle.values()].map((v) => v.versionId);
    const [openDisputeVersionIds, verifiedVersionIds, redactionMap] = await Promise.all([
      verificationRepo.findVersionIdsWithOpenDispute(versionIds),
      verificationRepo.findVerifiedVersionIds(versionIds),
      verificationRepo.findRedactionsForVersions(versionIds),
    ]);

    const out: {
      id: string;
      articleId: string;
      title: string;
      publisherName: string;
      trustStatus: TrustStatus;
      savedAt: string;
    }[] = [];
    for (const r of live) {
      const current = currentByArticle.get(r.articleId);
      if (!current) continue; // only a draft exists — nothing to show in the list
      const effectiveReviewStatus = verifiedVersionIds.has(current.versionId)
        ? "verified"
        : current.reviewStatus;
      const trustStatus = deriveTrustStatus({
        publisherVerified: current.publisherVerified,
        currentReviewStatus: effectiveReviewStatus as "pending_review" | "verified",
        isFirstVersion: current.versionMajor === 1 && current.versionMinor === 0,
        openDisputeCount: openDisputeVersionIds.has(current.versionId) ? 1 : 0,
      });
      out.push({
        id: r.id,
        articleId: r.articleId,
        // A redacted current version has no servable headline (Sprint 12).
        title: redactionMap.has(current.versionId) ? "" : current.headline,
        publisherName: r.publisherName,
        trustStatus,
        savedAt: r.savedAt.toISOString(),
      });
    }
    return out;
  }

  async function toApiFollows(rows: FollowRow[]) {
    const out: {
      id: string;
      publisherId: string;
      publisherName: string;
      verified: boolean;
      credibilityScore: number;
      createdAt: string;
    }[] = [];
    for (const r of rows) {
      // Read-time credibility, the same formula the verification endpoint uses.
      // Looped per followed publisher — reader follow counts are small at
      // year-one volume; batch it if that changes.
      const { credibilityScore } = computeCredibility(await verificationRepo.creditAggregate(r.publisherId));
      out.push({
        id: r.id,
        publisherId: r.publisherId,
        publisherName: r.publisherName,
        verified: r.verificationStatus === "verified",
        credibilityScore,
        createdAt: r.createdAt.toISOString(),
      });
    }
    return out;
  }

  return {
    async listSavedArticles(actor: Actor, cursor: string | undefined, limit: number) {
      const { items, nextCursor } = await repo.listSavedArticles(actor.accountId, cursor, limit);
      return { items: await toApiSavedArticles(items), nextCursor };
    },

    async saveArticle(actor: Actor, articleId: string) {
      const article = await repo.findArticleForSave(articleId);
      if (!article || article.archivedAt) throw new NotFoundError("No such article");
      // A bookmark feeds a trust-status list — it needs a published version to
      // say anything about. Nothing to save on a draft-only article.
      const current = await repo.currentVersionsForArticles([articleId]);
      if (current.size === 0) throw new NotFoundError("No such article");

      if (await repo.findSavedArticle(actor.accountId, articleId)) {
        throw new ConflictError("This article is already saved");
      }
      const created = await repo.createSavedArticle(actor.accountId, articleId);

      const row = await repo.findSavedArticleForResponse(created.id);
      const [one] = await toApiSavedArticles(row ? [row] : []);
      return one!;
    },

    async unsaveArticle(actor: Actor, savedArticleId: string) {
      const row = await repo.findSavedArticleById(savedArticleId);
      if (!row) throw new NotFoundError("No such saved article");
      if (row.accountId !== actor.accountId) {
        throw new ForbiddenError("Not the reader who saved this article");
      }
      await repo.deleteSavedArticle(savedArticleId);
    },

    async listFollows(actor: Actor, cursor: string | undefined, limit: number) {
      const { items, nextCursor } = await repo.listFollows(actor.accountId, cursor, limit);
      return { items: await toApiFollows(items), nextCursor };
    },

    async followPublisher(actor: Actor, publisherId: string) {
      const publisher = await repo.publisherExists(publisherId);
      if (!publisher) throw new NotFoundError("No such publisher");

      if (await repo.findFollow(actor.accountId, publisherId)) {
        throw new ConflictError("You are already following this publisher");
      }
      const created = await repo.createFollow(actor.accountId, publisherId);

      const [one] = await toApiFollows([
        {
          id: created.id,
          publisherId,
          createdAt: created.createdAt,
          publisherName: publisher.displayName,
          verificationStatus: publisher.verificationStatus,
        },
      ]);
      return one!;
    },

    async unfollowPublisher(actor: Actor, followId: string) {
      const row = await repo.findFollowById(followId);
      if (!row) throw new NotFoundError("No such follow");
      if (row.accountId !== actor.accountId) {
        throw new ForbiddenError("Not the reader who follows this publisher");
      }
      await repo.deleteFollow(followId);
    },
  };
}
