import { describe, expect, it } from "vitest";
import { computeCredibility, deriveTrustStatus, type CredibilityArticle } from "../src/services/trust";

describe("deriveTrustStatus", () => {
  const base = {
    publisherVerified: true,
    currentReviewStatus: "verified" as const,
    isFirstVersion: true,
    openDisputeCount: 0,
  };

  it("is authentic for a verified publisher's first, reviewer-verified version with no dispute", () => {
    expect(deriveTrustStatus(base)).toBe("authentic");
  });

  it("is updated once the current version is past v1.0", () => {
    expect(deriveTrustStatus({ ...base, isFirstVersion: false })).toBe("updated");
  });

  it("is authentic_under_review while the current version is still pending review", () => {
    expect(deriveTrustStatus({ ...base, currentReviewStatus: "pending_review" })).toBe("authentic_under_review");
  });

  it("is publisher_unverified when the publisher is not verified", () => {
    expect(deriveTrustStatus({ ...base, publisherVerified: false })).toBe("publisher_unverified");
  });

  it("is disputed whenever there is an open dispute — outranking every other posture", () => {
    expect(deriveTrustStatus({ ...base, openDisputeCount: 1 })).toBe("disputed");
    expect(
      deriveTrustStatus({
        publisherVerified: false,
        currentReviewStatus: "pending_review",
        isFirstVersion: false,
        openDisputeCount: 2,
      }),
    ).toBe("disputed");
  });

  it("puts publisher_unverified ahead of review/version state", () => {
    expect(
      deriveTrustStatus({ ...base, publisherVerified: false, currentReviewStatus: "pending_review", isFirstVersion: false }),
    ).toBe("publisher_unverified");
  });
});

describe("computeCredibility", () => {
  const article = (over: Partial<CredibilityArticle> = {}): CredibilityArticle => ({
    currentReviewStatus: "verified",
    publishedVersionCount: 1,
    hasOpenDispute: false,
    ...over,
  });

  it("returns score 0, transparencyLevel 3 for a publisher with no published articles", () => {
    expect(computeCredibility([])).toEqual({ credibilityScore: 0, transparencyLevel: 3 });
  });

  it("scores an all-verified, never-disputed, never-corrected publisher at 100 (60 + 40)", () => {
    expect(computeCredibility([article(), article(), article()])).toEqual({
      credibilityScore: 100,
      transparencyLevel: 1,
    });
  });

  it("drops the score for open disputes", () => {
    // 4 verified articles, 1 with an open dispute: 60 + 40*1 - 35*0.25 = 91.25 -> 91
    const arts = [article(), article(), article(), article({ hasOpenDispute: true })];
    expect(computeCredibility(arts).credibilityScore).toBe(91);
  });

  it("credits transparent corrections and lifts the transparency level", () => {
    // 2 of 2 articles corrected, both verified: 60 + 40 + 10 = 110 -> clamped 100; transparency 1 + round(4*1) = 5
    const arts = [article({ publishedVersionCount: 3 }), article({ publishedVersionCount: 2 })];
    expect(computeCredibility(arts)).toEqual({ credibilityScore: 100, transparencyLevel: 5 });
  });

  it("bottoms out at 60 - 35 = 25 when every article is disputed and none verified", () => {
    const arts = Array.from({ length: 3 }, () =>
      article({ currentReviewStatus: "pending_review", hasOpenDispute: true }),
    );
    expect(computeCredibility(arts).credibilityScore).toBe(25);
  });

  it("always produces a score within 0..100 and a level within 1..5", () => {
    const arts = [
      article({ hasOpenDispute: true, publishedVersionCount: 4 }),
      article({ currentReviewStatus: "pending_review" }),
      article(),
    ];
    const { credibilityScore, transparencyLevel } = computeCredibility(arts);
    expect(credibilityScore).toBeGreaterThanOrEqual(0);
    expect(credibilityScore).toBeLessThanOrEqual(100);
    expect(transparencyLevel).toBeGreaterThanOrEqual(1);
    expect(transparencyLevel).toBeLessThanOrEqual(5);
  });
});
