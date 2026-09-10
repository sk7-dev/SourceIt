import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

// The six publisher-dashboard reads, plus the write-side hooks that populate
// activity_events and credibility_score_history (Sprint 14).
describe("Publisher dashboard slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let reviewerToken: string;
  let readerToken: string; // any authenticated, non-member account
  let publisherId: string;

  let articleA: { articleId: string; versionId: string }; // published + verified
  let articleB: { articleId: string; versionId: string }; // published + disputed
  let articleC: { articleId: string; versionId: string }; // published + corrected

  beforeAll(async () => {
    ctx = await startTestApp();

    const [owner, reviewer, reader] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_pd_owner", email: "pd-owner@example.com", fullName: "Pd Owner", role: "publisher" },
        { clerkUserId: "clerk_pd_rev", email: "pd-rev@example.com", fullName: "Pat Reviewer", role: "reviewer" },
        { clerkUserId: "clerk_pd_reader", email: "pd-reader@example.com", fullName: "Ray Reader", role: "reader" },
      ])
      .returning();
    ownerToken = owner!.clerkUserId;
    reviewerToken = reviewer!.clerkUserId;
    readerToken = reader!.clerkUserId;

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_pd",
        organizationName: "Pd Org",
        displayName: "Dashboard Publisher",
        website: "https://pd.example",
        description: "d",
        verificationStatus: "verified",
      })
      .returning();
    publisherId = publisher!.id;
    await ctx.db.insert(schema.publisherMembers).values({ publisherId, accountId: owner!.id, role: "owner" });
    await ctx.db.insert(schema.reviewers).values({
      accountId: reviewer!.id,
      affiliation: "Independent",
      expertise: "X",
      applicationReason: "r",
      title: "Reviewer",
      approvalStatus: "approved",
      approvedAt: new Date(),
    });

    articleA = await publish("Article A");
    await verify(articleA.versionId);

    articleB = await publish("Article B");
    await fileDispute(articleB.versionId, "B has a wrong figure");

    articleC = await publish("Article C");
    await correct(articleC.articleId);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  async function publish(headline: string) {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: auth(ownerToken),
      payload: { publisherId, category: "science", headline, summary: "s", content: "c", authorName: "a", submit: true },
    });
    expect(res.statusCode).toBe(201);
    return { articleId: res.json().article.id as string, versionId: res.json().version.id as string };
  }
  async function verify(versionId: string) {
    const res = await ctx.app.inject({ method: "POST", url: `/versions/${versionId}/verify`, headers: auth(reviewerToken) });
    expect(res.statusCode).toBe(201);
  }
  async function fileDispute(versionId: string, reason: string) {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/disputes`,
      headers: auth(reviewerToken),
      payload: { reason },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }
  async function review(versionId: string, comment: string) {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/reviews`,
      headers: auth(reviewerToken),
      payload: { type: "clarification", comment },
    });
    expect(res.statusCode).toBe(201);
  }
  async function correct(articleId: string) {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/articles/${articleId}/versions`,
      headers: auth(ownerToken),
      payload: {
        headline: "Article C (corrected)",
        summary: "s2",
        content: "c2",
        authorName: "a",
        changeType: "minor_correction",
        changeSummary: "fixed a detail",
        submit: true,
      },
    });
    expect(res.statusCode).toBe(201);
  }
  const get = (path: string, token?: string) =>
    ctx.app.inject({ method: "GET", url: path, ...(token ? { headers: auth(token) } : {}) });

  const UNKNOWN = "00000000-0000-0000-0000-000000000000";

  describe("GET /publishers/:id", () => {
    it("is public and returns the profile with a read-time credibility score", async () => {
      const res = await get(`/publishers/${publisherId}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ id: publisherId, displayName: "Dashboard Publisher", verificationStatus: "verified" });
      expect(body.credibilityScore).toBeGreaterThanOrEqual(0);
      expect(body.credibilityScore).toBeLessThanOrEqual(100);
      expect(body.transparencyLevel).toBeGreaterThanOrEqual(1);
    });
    it("404s an unknown publisher", async () => {
      expect((await get(`/publishers/${UNKNOWN}`)).statusCode).toBe(404);
    });
  });

  describe("GET /publishers/:id/analytics", () => {
    it("401s without a session", async () => {
      expect((await get(`/publishers/${publisherId}/analytics`)).statusCode).toBe(401);
    });
    it("returns the derived counts to any authenticated account", async () => {
      const res = await get(`/publishers/${publisherId}/analytics`, readerToken);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        totalArticlesPublished: 3,
        verifiedArticleCount: 1,
        pendingReviewCount: 2,
        disputedArticleCount: 1,
      });
    });
    it("404s an unknown publisher", async () => {
      expect((await get(`/publishers/${UNKNOWN}/analytics`, readerToken)).statusCode).toBe(404);
    });
  });

  describe("GET /publishers/:id/activity", () => {
    it("401s without a session", async () => {
      expect((await get(`/publishers/${publisherId}/activity`)).statusCode).toBe(401);
    });
    it("lists the events written by the publish / correct / dispute hooks, newest first", async () => {
      const res = await get(`/publishers/${publisherId}/activity`, readerToken);
      expect(res.statusCode).toBe(200);
      const items = res.json().items as { type: string; createdAt: string }[];
      const types = items.map((e) => e.type);
      expect(types.filter((t) => t === "publish")).toHaveLength(3);
      expect(types).toContain("correction");
      expect(types).toContain("dispute_filed");
      const times = items.map((e) => e.createdAt);
      expect([...times]).toEqual([...times].sort().reverse());
    });
    it("walks pages by cursor without overlap", async () => {
      const p1 = (await get(`/publishers/${publisherId}/activity?limit=2`, readerToken)).json();
      expect(p1.items).toHaveLength(2);
      expect(p1.nextCursor).toBeTypeOf("string");
      const p2 = (
        await get(`/publishers/${publisherId}/activity?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`, readerToken)
      ).json();
      const ids = [...p1.items, ...p2.items].map((e: { id: string }) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("GET /publishers/:id/credibility", () => {
    it("is public and returns the breakdown", async () => {
      const res = await get(`/publishers/${publisherId}/credibility`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.score).toBeTypeOf("number");
      expect(body.tier).toBeTypeOf("string");
      expect(body.trend === null || typeof body.trend === "number").toBe(true);
      expect(body.factors).toEqual({ verifiedArticles: 1, disputedClaims: 1, transparentCorrections: 1 });
    });
    it("404s an unknown publisher", async () => {
      expect((await get(`/publishers/${UNKNOWN}/credibility`)).statusCode).toBe(404);
    });
  });

  describe("GET /publishers/:id/credibility-history", () => {
    it("is public and has points written by the score-moving hooks", async () => {
      const res = await get(`/publishers/${publisherId}/credibility-history`);
      expect(res.statusCode).toBe(200);
      const items = res.json().items as { score: number; recordedAt: string }[];
      expect(items.length).toBeGreaterThan(0);
      for (const p of items) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.recordedAt).toBeTypeOf("string");
      }
      const times = items.map((p) => p.recordedAt);
      expect([...times]).toEqual([...times].sort().reverse());
    });
    it("does not record a point when the score is unchanged", async () => {
      const before = await ctx.db
        .select()
        .from(schema.credibilityScoreHistory)
        .where(eq(schema.credibilityScoreHistory.publisherId, publisherId));
      // A review does not move the score — its hook writes activity only.
      await review(articleA.versionId, "looks fine");
      const after = await ctx.db
        .select()
        .from(schema.credibilityScoreHistory)
        .where(eq(schema.credibilityScoreHistory.publisherId, publisherId));
      expect(after.length).toBe(before.length);
    });
  });

  describe("GET /publishers/:id/reviews", () => {
    it("401s without a session", async () => {
      expect((await get(`/publishers/${publisherId}/reviews`)).statusCode).toBe(401);
    });
    it("returns reviews and disputes as one chronological stream", async () => {
      await review(articleA.versionId, "r-one");
      await review(articleA.versionId, "r-two");
      await fileDispute(articleC.versionId, "C dispute");

      const res = await get(`/publishers/${publisherId}/reviews`, readerToken);
      expect(res.statusCode).toBe(200);
      const items = res.json().items as Record<string, unknown>[];
      expect(items.some((i) => "comment" in i)).toBe(true); // a review
      expect(items.some((i) => "status" in i && "events" in i)).toBe(true); // a dispute
      const times = items.map((i) => i.createdAt as string);
      expect([...times]).toEqual([...times].sort().reverse());
    });
    it("paginates the merged stream by a composite cursor without overlap", async () => {
      const all: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const qs: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const page = (await get(`/publishers/${publisherId}/reviews${qs}`, readerToken)).json();
        for (const item of page.items) all.push(item.id as string);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(new Set(all).size).toBe(all.length);
      expect(all.length).toBeGreaterThanOrEqual(4);
    });
    it("404s an unknown publisher", async () => {
      expect((await get(`/publishers/${UNKNOWN}/reviews`, readerToken)).statusCode).toBe(404);
    });
  });
});
