import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

describe("Admin decision queues", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let adminToken: string;
  let nonAdminToken: string;
  let pendingPublisherId: string;
  let unverifiedPublisherId: string;
  let pendingReviewerId: string;
  let pendingReviewerAccountId: string;
  let approvedReviewerId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [admin, plain, revPendingAcct, revApprovedAcct] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_ad_admin", email: "ad-admin@example.com", fullName: "Ada Admin", role: "admin" },
        { clerkUserId: "clerk_ad_plain", email: "ad-plain@example.com", fullName: "Pat Plain", role: "publisher" },
        { clerkUserId: "clerk_ad_revp", email: "ad-revp@example.com", fullName: "Reva Pending", role: "reviewer" },
        { clerkUserId: "clerk_ad_reva", email: "ad-reva@example.com", fullName: "Rex Approved", role: "reviewer" },
      ])
      .returning();
    adminToken = admin!.clerkUserId;
    nonAdminToken = plain!.clerkUserId;
    pendingReviewerAccountId = revPendingAcct!.id;

    const [pendingPub, unverifiedPub] = await ctx.db
      .insert(schema.publishers)
      .values([
        { clerkOrgId: "org_ad_pending", organizationName: "Pending Org", displayName: "Pending Pub", website: "https://p.example", description: "d", verificationStatus: "pending" },
        { clerkOrgId: "org_ad_unv", organizationName: "Unv Org", displayName: "Unv Pub", website: "https://u.example", description: "d", verificationStatus: "unverified" },
      ])
      .returning();
    pendingPublisherId = pendingPub!.id;
    unverifiedPublisherId = unverifiedPub!.id;

    const [revPending, revApproved] = await ctx.db
      .insert(schema.reviewers)
      .values([
        { accountId: revPendingAcct!.id, affiliation: "Somewhere", expertise: "Policy", applicationReason: "I care about accuracy", approvalStatus: "pending" },
        { accountId: revApprovedAcct!.id, affiliation: "Elsewhere", expertise: "Science", applicationReason: "r", approvalStatus: "approved", approvedAt: new Date() },
      ])
      .returning();
    pendingReviewerId = revPending!.id;
    approvedReviewerId = revApproved!.id;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  describe("GET /publishers/pending-verification", () => {
    it("401s without a token, 403s a non-admin", async () => {
      expect((await ctx.app.inject({ method: "GET", url: "/publishers/pending-verification" })).statusCode).toBe(401);
      const res = await ctx.app.inject({ method: "GET", url: "/publishers/pending-verification", headers: auth(nonAdminToken) });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("returns only pending publishers to an admin", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/publishers/pending-verification", headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const statuses = res.json().items.map((p: { verificationStatus: string }) => p.verificationStatus);
      expect(statuses.length).toBeGreaterThan(0);
      expect(new Set(statuses)).toEqual(new Set(["pending"]));
      expect(res.json().items.map((p: { id: string }) => p.id)).toContain(pendingPublisherId);
    });
  });

  describe("POST /publishers/:publisherId/verification", () => {
    it("403s a non-admin", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/publishers/${pendingPublisherId}/verification`,
        headers: auth(nonAdminToken),
        payload: { decision: "verified" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("404s an unknown publisher", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/publishers/00000000-0000-0000-0000-000000000000/verification",
        headers: auth(adminToken),
        payload: { decision: "verified" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("400s a bad decision value", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/publishers/${pendingPublisherId}/verification`,
        headers: auth(adminToken),
        payload: { decision: "maybe" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("verifies a pending publisher, records who did it, and drops it from the queue", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/publishers/${pendingPublisherId}/verification`,
        headers: auth(adminToken),
        payload: { decision: "verified" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().verificationStatus).toBe("verified");

      const [row] = await ctx.db
        .select()
        .from(schema.publishers)
        .where(eq(schema.publishers.id, pendingPublisherId));
      expect(row!.verifiedByAccountId).not.toBeNull();
      expect(row!.verifiedAt).not.toBeNull();

      const queue = await ctx.app.inject({ method: "GET", url: "/publishers/pending-verification", headers: auth(adminToken) });
      expect(queue.json().items.map((p: { id: string }) => p.id)).not.toContain(pendingPublisherId);
    });

    it("can reject a publisher, and can revoke a previously granted verification", async () => {
      const reject = await ctx.app.inject({
        method: "POST",
        url: `/publishers/${unverifiedPublisherId}/verification`,
        headers: auth(adminToken),
        payload: { decision: "rejected" },
      });
      expect(reject.statusCode).toBe(200);
      expect(reject.json().verificationStatus).toBe("rejected");

      // pendingPublisherId was verified in the previous test — revoke it.
      const revoke = await ctx.app.inject({
        method: "POST",
        url: `/publishers/${pendingPublisherId}/verification`,
        headers: auth(adminToken),
        payload: { decision: "rejected" },
      });
      expect(revoke.statusCode).toBe(200);
      expect(revoke.json().verificationStatus).toBe("rejected");
    });
  });

  describe("GET /reviewers/pending", () => {
    it("403s a non-admin", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/reviewers/pending", headers: auth(nonAdminToken) });
      expect(res.statusCode).toBe(403);
    });

    it("returns only pending reviewers to an admin", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/reviewers/pending", headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const statuses = res.json().items.map((r: { approvalStatus: string }) => r.approvalStatus);
      expect(new Set(statuses)).toEqual(new Set(["pending"]));
      const ids = res.json().items.map((r: { id: string }) => r.id);
      expect(ids).toContain(pendingReviewerId);
      expect(ids).not.toContain(approvedReviewerId);
    });
  });

  describe("POST /reviewers/:reviewerId/decision", () => {
    it("403s a non-admin, 404s an unknown reviewer, 400s a bad decision", async () => {
      expect(
        (
          await ctx.app.inject({
            method: "POST",
            url: `/reviewers/${pendingReviewerId}/decision`,
            headers: auth(nonAdminToken),
            payload: { decision: "approved" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await ctx.app.inject({
            method: "POST",
            url: "/reviewers/00000000-0000-0000-0000-000000000000/decision",
            headers: auth(adminToken),
            payload: { decision: "approved" },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await ctx.app.inject({
            method: "POST",
            url: `/reviewers/${pendingReviewerId}/decision`,
            headers: auth(adminToken),
            payload: { decision: "yes" },
          })
        ).statusCode,
      ).toBe(400);
    });

    it("approves a pending reviewer — recorded, dropped from the queue, and the gate now lets them in", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/reviewers/${pendingReviewerId}/decision`,
        headers: auth(adminToken),
        payload: { decision: "approved" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().approvalStatus).toBe("approved");

      const [row] = await ctx.db.select().from(schema.reviewers).where(eq(schema.reviewers.id, pendingReviewerId));
      expect(row!.approvedByAccountId).not.toBeNull();
      expect(row!.approvedAt).not.toBeNull();

      const queue = await ctx.app.inject({ method: "GET", url: "/reviewers/pending", headers: auth(adminToken) });
      expect(queue.json().items.map((r: { id: string }) => r.id)).not.toContain(pendingReviewerId);

      // End to end: the just-approved reviewer can now file a review that a
      // pending reviewer could not (review:create gate).
      const [pubOwner] = await ctx.db
        .insert(schema.accounts)
        .values({ clerkUserId: "clerk_ad_pubowner", email: "ad-pubowner@example.com", fullName: "Owen", role: "publisher" })
        .returning();
      const [pub] = await ctx.db
        .insert(schema.publishers)
        .values({ clerkOrgId: "org_ad_e2e", organizationName: "E2E Org", displayName: "E2E", website: "https://e2e.example", description: "d", verificationStatus: "verified" })
        .returning();
      await ctx.db.insert(schema.publisherMembers).values({ publisherId: pub!.id, accountId: pubOwner!.id, role: "owner" });

      const article = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: auth(pubOwner!.clerkUserId),
        payload: { publisherId: pub!.id, category: "science", headline: "H", summary: "s", content: "c", authorName: "a", submit: true },
      });
      const versionId = article.json().version.id as string;

      // The pending reviewer's account token is derived from its clerkUserId.
      const [pendingAcct] = await ctx.db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, pendingReviewerAccountId));
      const reviewRes = await ctx.app.inject({
        method: "POST",
        url: `/versions/${versionId}/reviews`,
        headers: auth(pendingAcct!.clerkUserId),
        payload: { type: "confirmation", comment: "Now allowed." },
      });
      expect(reviewRes.statusCode).toBe(201);
    });

    it("can reject a reviewer application", async () => {
      const [acct] = await ctx.db
        .insert(schema.accounts)
        .values({ clerkUserId: "clerk_ad_revrej", email: "ad-revrej@example.com", fullName: "Ray Reject", role: "reviewer" })
        .returning();
      const [rev] = await ctx.db
        .insert(schema.reviewers)
        .values({ accountId: acct!.id, affiliation: "X", expertise: "Y", applicationReason: "r", approvalStatus: "pending" })
        .returning();

      const res = await ctx.app.inject({
        method: "POST",
        url: `/reviewers/${rev!.id}/decision`,
        headers: auth(adminToken),
        payload: { decision: "rejected" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().approvalStatus).toBe("rejected");
    });
  });
});
