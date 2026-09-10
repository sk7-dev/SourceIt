import { NotFoundError } from "../errors";
import { computeCredibility } from "./trust";
import { toApiReview } from "./reviews.service";
import { toApiDispute } from "./disputes.service";
import type { createPublishersRepository } from "../repositories/publishers.repository";
import type { createVerificationRepository } from "../repositories/verification.repository";
import type { createPublisherDashboardRepository } from "../repositories/publisherDashboard.repository";
import { encodeCursor, decodeCursor } from "../repositories/publisherDashboard.repository";

type PublishersRepo = ReturnType<typeof createPublishersRepository>;
type VerificationRepo = ReturnType<typeof createVerificationRepository>;
type DashboardRepo = ReturnType<typeof createPublisherDashboardRepository>;

// CredibilityPanel.tsx shows "Excellent" and "Outstanding"; the full ladder is a
// Sprint 14 decision — a plain label off the score, revisitable.
function tierFor(score: number): string {
  if (score >= 90) return "Outstanding";
  if (score >= 75) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

function toApiPublisherProfile(
  row: NonNullable<Awaited<ReturnType<PublishersRepo["findById"]>>>,
  score: number,
  transparencyLevel: number,
) {
  return {
    id: row.id,
    organizationName: row.organizationName,
    displayName: row.displayName,
    website: row.website,
    description: row.description,
    categories: row.categories,
    verificationStatus: row.verificationStatus,
    transparencyLevel,
    credibilityScore: score,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPublisherDashboardService(
  publishersRepo: PublishersRepo,
  verificationRepo: VerificationRepo,
  dashboardRepo: DashboardRepo,
) {
  async function requirePublisher(publisherId: string) {
    const publisher = await publishersRepo.findById(publisherId);
    if (!publisher) throw new NotFoundError("Publisher not found");
    return publisher;
  }

  return {
    // GET /publishers/{id} — public profile with the read-time credibility.
    async getPublisher(publisherId: string) {
      const publisher = await requirePublisher(publisherId);
      const { credibilityScore, transparencyLevel } = computeCredibility(
        await verificationRepo.creditAggregate(publisherId),
      );
      return toApiPublisherProfile(publisher, credibilityScore, transparencyLevel);
    },

    // GET /publishers/{id}/analytics — derived aggregate counts.
    async getAnalytics(publisherId: string) {
      await requirePublisher(publisherId);
      const articles = await verificationRepo.creditAggregate(publisherId);
      return {
        totalArticlesPublished: articles.length,
        verifiedArticleCount: articles.filter((a) => a.currentReviewStatus === "verified").length,
        pendingReviewCount: articles.filter((a) => a.currentReviewStatus === "pending_review").length,
        disputedArticleCount: articles.filter((a) => a.hasOpenDispute).length,
      };
    },

    // GET /publishers/{id}/activity — the append-only feed, newest first.
    async getActivity(publisherId: string, cursor: string | undefined, limit: number) {
      await requirePublisher(publisherId);
      const { items, nextCursor } = await dashboardRepo.listActivity(publisherId, cursor, limit);
      return {
        items: items.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          articleId: e.articleId,
          createdAt: e.createdAt.toISOString(),
        })),
        nextCursor,
      };
    },

    // GET /publishers/{id}/credibility — the published breakdown behind the score.
    async getCredibility(publisherId: string) {
      await requirePublisher(publisherId);
      const articles = await verificationRepo.creditAggregate(publisherId);
      const { credibilityScore } = computeCredibility(articles);
      const lastPoint = await dashboardRepo.latestCredibilityScore(publisherId);
      return {
        score: credibilityScore,
        tier: tierFor(credibilityScore),
        trend: lastPoint === null ? null : credibilityScore - lastPoint,
        factors: {
          verifiedArticles: articles.filter((a) => a.currentReviewStatus === "verified").length,
          disputedClaims: articles.filter((a) => a.hasOpenDispute).length,
          transparentCorrections: articles.filter((a) => a.publishedVersionCount > 1).length,
        },
      };
    },

    // GET /publishers/{id}/credibility-history — the sparkline series, newest first.
    async getCredibilityHistory(publisherId: string, cursor: string | undefined, limit: number) {
      await requirePublisher(publisherId);
      const { items, nextCursor } = await dashboardRepo.listCredibilityHistory(publisherId, cursor, limit);
      return {
        items: items.map((p) => ({ score: p.score, recordedAt: p.recordedAt.toISOString() })),
        nextCursor,
      };
    },

    // GET /publishers/{id}/reviews — reviews and disputes against this
    // publisher's articles, one chronological page across both tables. Cursor is
    // `<createdAt ISO>~<kind>~<id>`, a total order so same-millisecond rows
    // neither repeat nor drop.
    async getReviewsAndDisputes(publisherId: string, cursor: string | undefined, limit: number) {
      await requirePublisher(publisherId);
      const c = decodeCursor(cursor, 3);
      const tsCeil = c ? new Date(c[0]!) : null;

      const [reviewRows, disputeRows] = await Promise.all([
        dashboardRepo.publisherReviewsPage(publisherId, tsCeil, limit + 1),
        dashboardRepo.publisherDisputesPage(publisherId, tsCeil, limit + 1),
      ]);
      const events = await dashboardRepo.eventsForDisputes(disputeRows.map((d) => d.id));
      const eventsByDispute = new Map<string, typeof events>();
      for (const e of events) {
        const b = eventsByDispute.get(e.disputeId);
        if (b) b.push(e);
        else eventsByDispute.set(e.disputeId, [e]);
      }

      type Tagged = { ts: number; kind: "d" | "r"; id: string; payload: unknown };
      const merged: Tagged[] = [
        ...reviewRows.map((r) => ({
          ts: r.createdAt.getTime(),
          kind: "r" as const,
          id: r.id,
          payload: toApiReview(r as never),
        })),
        ...disputeRows.map((d) => ({
          ts: d.createdAt.getTime(),
          kind: "d" as const,
          id: d.id,
          payload: toApiDispute(d as never, eventsByDispute.get(d.id) ?? []),
        })),
      ];

      // Newest first; within a millisecond, order by (kind, id) for a stable
      // total order.
      merged.sort((a, b) => b.ts - a.ts || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

      const afterCursor = c
        ? merged.filter((m) => {
            if (m.ts !== tsCeil!.getTime()) return m.ts < tsCeil!.getTime();
            if (m.kind !== c[1]) return m.kind.localeCompare(c[1]!) > 0;
            return m.id.localeCompare(c[2]!) > 0;
          })
        : merged;

      const page = afterCursor.slice(0, limit);
      const last = page[page.length - 1];
      const nextCursor =
        afterCursor.length > limit && last
          ? encodeCursor([new Date(last.ts).toISOString(), last.kind, last.id])
          : null;
      return { items: page.map((m) => m.payload), nextCursor };
    },
  };
}
