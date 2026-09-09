import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

describe("Review vertical slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let approvedReviewerToken: string;
  let pendingReviewerToken: string;
  let affiliatedReviewerToken: string;
  let plainToken: string;
  let publisherId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [owner, approvedRev, pendingRev, affiliatedRev, plain] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_rv_owner", email: "rv-owner@example.com", fullName: "Rv Owner", role: "publisher" },
        { clerkUserId: "clerk_rv_approved", email: "rv-approved@example.com", fullName: "Alex Approved", role: "reviewer" },
        { clerkUserId: "clerk_rv_pending", email: "rv-pending@example.com", fullName: "Pat Pending", role: "reviewer" },
        { clerkUserId: "clerk_rv_affiliated", email: "rv-affiliated@example.com", fullName: "Sam Affiliated", role: "reviewer" },
        { clerkUserId: "clerk_rv_plain", email: "rv-plain@example.com", fullName: "Casey Plain", role: "publisher" },
      ])
      .returning();
    ownerToken = owner!.clerkUserId;
    approvedReviewerToken = approvedRev!.clerkUserId;
    pendingReviewerToken = pendingRev!.clerkUserId;
    affiliatedReviewerToken = affiliatedRev!.clerkUserId;
    plainToken = plain!.clerkUserId;

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_rv",
        organizationName: "Rv Org",
        displayName: "Rv Publisher",
        website: "https://rv.example",
        description: "d",
        verificationStatus: "verified",
      })
      .returning();
    publisherId = publisher!.id;

    await ctx.db.insert(schema.publisherMembers).values([
      { publisherId, accountId: owner!.id, role: "owner" },
      // The affiliated reviewer is a structural member of the publisher — this
      // is the conflict of interest the review:create gate must block.
      { publisherId, accountId: affiliatedRev!.id, role: "member" },
    ]);

    await ctx.db.insert(schema.reviewers).values([
      {
        accountId: approvedRev!.id,
        affiliation: "Independent",
        expertise: "Climate",
        applicationReason: "r",
        title: "Climate Reviewer",
        pseudonym: "Dr. Quill",
        useLegalName: false,
        approvalStatus: "approved",
        approvedAt: new Date(),
      },
      {
        accountId: pendingRev!.id,
        affiliation: "Somewhere",
        expertise: "Policy",
        applicationReason: "r",
        approvalStatus: "pending",
      },
      {
        accountId: affiliatedRev!.id,
        affiliation: "Rv Org",
        expertise: "Everything",
        applicationReason: "r",
        approvalStatus: "approved",
        approvedAt: new Date(),
      },
    ]);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function publishArticle() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        publisherId,
        category: "science",
        headline: "Reviewable",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: true,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().version.id as string;
  }

  async function createDraft() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        publisherId,
        category: "science",
        headline: "Draft",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: false,
      },
    });
    return res.json().version.id as string;
  }

  function postReview(
    versionId: string,
    token: string,
    body: Record<string, unknown> = { type: "confirmation", comment: "Checks out." },
  ) {
    return ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/reviews`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  describe("GET /versions/:versionId/reviews", () => {
    it("404s for an unknown version", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: "/versions/00000000-0000-0000-0000-000000000000/reviews",
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("404s for a draft version — its reviews are not public", async () => {
      const versionId = await createDraft();
      const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/reviews` });
      expect(res.statusCode).toBe(404);
    });

    it("returns an empty page for a published version with no reviews", async () => {
      const versionId = await publishArticle();
      const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/reviews` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [], nextCursor: null });
    });

    it("walks every review across cursor pages without overlap", async () => {
      const versionId = await publishArticle();
      for (const comment of ["one", "two", "three"]) {
        const r = await postReview(versionId, approvedReviewerToken, { type: "clarification", comment });
        expect(r.statusCode).toBe(201);
      }
      const page1 = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/reviews?limit=2` });
      const b1 = page1.json();
      expect(b1.items).toHaveLength(2);
      expect(b1.nextCursor).toBeTypeOf("string");

      const page2 = await ctx.app.inject({
        method: "GET",
        url: `/versions/${versionId}/reviews?limit=2&cursor=${encodeURIComponent(b1.nextCursor)}`,
      });
      const b2 = page2.json();
      expect(b2.items).toHaveLength(1);
      expect(b2.nextCursor).toBeNull();

      const comments = [...b1.items, ...b2.items].map((r: { comment: string }) => r.comment);
      expect(new Set(comments)).toEqual(new Set(["one", "two", "three"]));
    });
  });

  describe("POST /versions/:versionId/reviews", () => {
    it("401s without an Authorization header", async () => {
      const versionId = await publishArticle();
      const res = await ctx.app.inject({
        method: "POST",
        url: `/versions/${versionId}/reviews`,
        payload: { type: "confirmation", comment: "x" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("403s when the actor is not a reviewer at all", async () => {
      const versionId = await publishArticle();
      const res = await postReview(versionId, plainToken);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("403s when the actor is an unapproved (pending) reviewer", async () => {
      const versionId = await publishArticle();
      const res = await postReview(versionId, pendingReviewerToken);
      expect(res.statusCode).toBe(403);
    });

    it("403s when the reviewer is structurally affiliated with the publisher (conflict of interest)", async () => {
      const versionId = await publishArticle();
      const res = await postReview(versionId, affiliatedReviewerToken);
      expect(res.statusCode).toBe(403);
    });

    it("404s for an unknown version", async () => {
      const res = await postReview("00000000-0000-0000-0000-000000000000", approvedReviewerToken);
      expect(res.statusCode).toBe(404);
    });

    it("404s for a draft version", async () => {
      const versionId = await createDraft();
      const res = await postReview(versionId, approvedReviewerToken);
      expect(res.statusCode).toBe(404);
    });

    it("400s on a missing comment", async () => {
      const versionId = await publishArticle();
      const res = await postReview(versionId, approvedReviewerToken, { type: "confirmation" });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("201s for an approved, non-affiliated reviewer and exposes only the public identity", async () => {
      const versionId = await publishArticle();
      const res = await postReview(versionId, approvedReviewerToken, {
        type: "correction_note",
        comment: "Figure 2's axis label is wrong.",
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        articleVersionId: versionId,
        type: "correction_note",
        comment: "Figure 2's axis label is wrong.",
        isRetracted: false,
        retractedReason: null,
        reviewer: { displayName: "Dr. Quill", title: "Climate Reviewer" },
      });
      expect(body.reviewer).not.toHaveProperty("fullName");
    });
  });

  describe("POST /reviews/:reviewId/retract", () => {
    async function createReview() {
      const versionId = await publishArticle();
      const res = await postReview(versionId, approvedReviewerToken, { type: "confirmation", comment: "Original text." });
      return res.json().id as string;
    }

    it("401s without an Authorization header", async () => {
      const reviewId = await createReview();
      const res = await ctx.app.inject({ method: "POST", url: `/reviews/${reviewId}/retract`, payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it("404s for an unknown review", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/reviews/00000000-0000-0000-0000-000000000000/retract",
        headers: { authorization: `Bearer ${approvedReviewerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it("403s when someone other than the author tries to retract it", async () => {
      const reviewId = await createReview();
      const res = await ctx.app.inject({
        method: "POST",
        url: `/reviews/${reviewId}/retract`,
        headers: { authorization: `Bearer ${affiliatedReviewerToken}` },
        payload: { reason: "not mine to retract" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("lets the author retract, keeping the original comment intact", async () => {
      const reviewId = await createReview();
      const res = await ctx.app.inject({
        method: "POST",
        url: `/reviews/${reviewId}/retract`,
        headers: { authorization: `Bearer ${approvedReviewerToken}` },
        payload: { reason: "Superseded by a corrected version" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: reviewId,
        comment: "Original text.",
        isRetracted: true,
        retractedReason: "Superseded by a corrected version",
      });
    });

    it("409s on a second retract of the same review", async () => {
      const reviewId = await createReview();
      const first = await ctx.app.inject({
        method: "POST",
        url: `/reviews/${reviewId}/retract`,
        headers: { authorization: `Bearer ${approvedReviewerToken}` },
        payload: {},
      });
      expect(first.statusCode).toBe(200);
      const second = await ctx.app.inject({
        method: "POST",
        url: `/reviews/${reviewId}/retract`,
        headers: { authorization: `Bearer ${approvedReviewerToken}` },
        payload: {},
      });
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("append-only invariant", () => {
    it("rejects UPDATE against reviews and review_retractions", async () => {
      const versionId = await publishArticle();
      const created = await postReview(versionId, approvedReviewerToken, { type: "confirmation", comment: "immutable" });
      const reviewId = created.json().id as string;

      await expect(
        ctx.db.update(schema.reviews).set({ comment: "tampered" }).where(eq(schema.reviews.id, reviewId)),
      ).rejects.toThrow(/append-only/);

      await ctx.app.inject({
        method: "POST",
        url: `/reviews/${reviewId}/retract`,
        headers: { authorization: `Bearer ${approvedReviewerToken}` },
        payload: { reason: "r" },
      });
      await expect(
        ctx.db
          .update(schema.reviewRetractions)
          .set({ reason: "tampered" })
          .where(eq(schema.reviewRetractions.reviewId, reviewId)),
      ).rejects.toThrow(/append-only/);
    });
  });
});
