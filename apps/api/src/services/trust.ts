// Pure derivations for GET /articles/{id}/verification. No I/O — every input is
// already-loaded data, so this is unit-testable in isolation (test/trust.unit.test.ts).

export type TrustStatus =
  | "authentic"
  | "authentic_under_review"
  | "updated"
  | "disputed"
  | "publisher_unverified"
  | "notfound";

// docs/DOMAIN.md #12. Precedence (confirmed with the user, 2026-09-09):
//   notfound > disputed > publisher_unverified > authentic_under_review > updated > authentic
// `notfound` is handled by the route (no article / archived / no published
// version) and never reaches here. Anchor state (pending / anchor_failed) is a
// separate track and is NOT an input — it is returned in `anchorRecord`.
export function deriveTrustStatus(input: {
  publisherVerified: boolean;
  currentReviewStatus: "pending_review" | "verified";
  isFirstVersion: boolean; // the current version is v1.0
  openDisputeCount: number;
}): TrustStatus {
  if (input.openDisputeCount > 0) return "disputed";
  if (!input.publisherVerified) return "publisher_unverified";
  if (input.currentReviewStatus === "pending_review") return "authentic_under_review";
  if (!input.isFirstVersion) return "updated";
  return "authentic";
}

export interface CredibilityArticle {
  currentReviewStatus: string; // "pending_review" | "verified"
  publishedVersionCount: number; // >= 1
  hasOpenDispute: boolean;
}

// Credibility score v1 — the 3 factors the frontend shows (decision 2026-08-26),
// as ratios over the publisher's published articles so a small clean publisher
// isn't out-scored by a large one on volume alone. Weights confirmed with the
// user, 2026-09-09:
//   score = clamp(0..100, round(60 + 40*verifiedRatio - 35*openDisputeRatio + 10*correctionRatio))
//   transparencyLevel = clamp(1..5, 1 + round(4*correctionRatio))
// No published articles → score 0, transparencyLevel 3 (the column default).
// Computed at read time; the cached publishers.credibility_score column and the
// credibility_score_history table are left for a later publisher-dashboard slice.
export function computeCredibility(articles: CredibilityArticle[]): {
  credibilityScore: number;
  transparencyLevel: number;
} {
  const total = articles.length;
  if (total === 0) return { credibilityScore: 0, transparencyLevel: 3 };

  const verifiedRatio = articles.filter((a) => a.currentReviewStatus === "verified").length / total;
  const openDisputeRatio = articles.filter((a) => a.hasOpenDispute).length / total;
  const correctionRatio = articles.filter((a) => a.publishedVersionCount > 1).length / total;

  const raw = 60 + 40 * verifiedRatio - 35 * openDisputeRatio + 10 * correctionRatio;
  const credibilityScore = Math.max(0, Math.min(100, Math.round(raw)));
  const transparencyLevel = Math.max(1, Math.min(5, 1 + Math.round(4 * correctionRatio)));
  return { credibilityScore, transparencyLevel };
}
