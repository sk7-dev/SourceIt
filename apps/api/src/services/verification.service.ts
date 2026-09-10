import { toApiArticle, toApiVersion } from "./articles.service";
import { toApiEvidence } from "./evidence.service";
import { toApiReview } from "./reviews.service";
import { computeCredibility, deriveTrustStatus } from "./trust";
import type { createVerificationRepository } from "../repositories/verification.repository";
import type { createEvidenceRepository } from "../repositories/evidence.repository";
import type { createReviewsRepository } from "../repositories/reviews.repository";
import type { createAnchorRepository } from "../repositories/anchor.repository";

type VerificationRepo = ReturnType<typeof createVerificationRepository>;
type EvidenceRepo = ReturnType<typeof createEvidenceRepository>;
type ReviewsRepo = ReturnType<typeof createReviewsRepository>;
type AnchorRepo = ReturnType<typeof createAnchorRepository>;

// Version-scoped evidence / review counts are small at year-one volume; a single
// LIMIT well above any realistic count keeps the hot read path to one query each.
const ALL = 1000;

function toApiAnchor(row: NonNullable<Awaited<ReturnType<AnchorRepo["findAnchorForVersion"]>>>) {
  return {
    articleVersionId: row.articleVersionId,
    status: row.status,
    contentHash: row.contentHash,
    merkleProof: row.merkleProof,
    merkleRoot: row.merkleRoot,
    chainTxHash: row.chainTxHash,
    blockHeight: row.blockHeight,
    chainConfirmations: row.chainConfirmations,
    anchoredAt: row.anchoredAt?.toISOString() ?? null,
  };
}

export function createVerificationService(
  repo: VerificationRepo,
  evidenceRepo: EvidenceRepo,
  reviewsRepo: ReviewsRepo,
  anchorRepo: AnchorRepo,
) {
  return {
    // GET /articles/{articleId}/verification — public, unauthenticated, the one
    // read that must never be slow or down. Returns null when there is nothing
    // to verify (unknown / archived article, or no published version yet); the
    // route turns that into the `{ trustStatus: "notfound" }` 404 body.
    async getVerification(articleId: string) {
      const article = await repo.findArticle(articleId);
      if (!article || article.archivedAt) return null;

      const versions = await repo.listPublishedVersions(articleId);
      const currentVersion = versions[0];
      if (!currentVersion) return null; // only a draft exists — nothing public

      const publisher = await repo.findPublisher(article.publisherId);
      if (!publisher) return null;

      const [evidenceRows, reviewRows, anchorRow, redaction, openDisputeCount, creditArticles] =
        await Promise.all([
          evidenceRepo.listEvidence(currentVersion.id, undefined, ALL),
          reviewsRepo.listReviews(currentVersion.id, undefined, ALL),
          anchorRepo.findAnchorForVersion(currentVersion.id),
          repo.findRedactionForVersion(currentVersion.id),
          repo.countOpenDisputesForVersion(currentVersion.id),
          repo.creditAggregate(article.publisherId),
        ]);

      // Every submitted version gets a `pending` anchor record at submit time;
      // one with none is not fully registered — nothing to verify.
      if (!anchorRow) return null;

      const publisherVerified = publisher.verificationStatus === "verified";
      const isFirstVersion = currentVersion.versionMajor === 1 && currentVersion.versionMinor === 0;

      const trustStatus = deriveTrustStatus({
        publisherVerified,
        currentReviewStatus: currentVersion.reviewStatus as "pending_review" | "verified",
        isFirstVersion,
        openDisputeCount,
      });

      const { credibilityScore, transparencyLevel } = computeCredibility(creditArticles);

      return {
        article: toApiArticle(article),
        currentVersion: toApiVersion(currentVersion),
        versionHistory: versions.map(toApiVersion),
        evidence: evidenceRows.items.map(toApiEvidence),
        reviews: reviewRows.items.map(toApiReview),
        publisher: {
          id: publisher.id,
          organizationName: publisher.organizationName,
          displayName: publisher.displayName,
          website: publisher.website,
          description: publisher.description,
          categories: publisher.categories,
          verificationStatus: publisher.verificationStatus,
          transparencyLevel,
          credibilityScore,
          createdAt: publisher.createdAt.toISOString(),
        },
        anchorRecord: toApiAnchor(anchorRow),
        redaction: redaction
          ? {
              articleVersionId: redaction.articleVersionId,
              category: redaction.category,
              tombstoneHash: redaction.tombstoneHash,
              redactedAt: redaction.redactedAt.toISOString(),
            }
          : null,
        trustStatus,
        trustSummary: {
          // The article is in the registry and being served — true on every 200.
          registryMember: true,
          // The current version is a registered (submitted, hashed) record.
          versionMatch: currentVersion.contentHash !== null,
          publisherVerified,
          evidenceCount: evidenceRows.items.length,
          openDisputeCount,
        },
      };
    },
  };
}
