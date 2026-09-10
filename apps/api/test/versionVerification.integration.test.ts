import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

// POST /versions/:versionId/verify — Sprint 11. An approved reviewer with no
// structural affiliation to the publisher records an append-only
// version_verifications row; the composed GET /articles/:id/verification then
// reports the version's reviewStatus as "verified" and (v1.0, no dispute)
// TrustStatus "authentic".
describe("Version-verification slice", () => {
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
        { clerkUserId: "clerk_vv_owner", email: "vv-owner@example.com", fullName: "Vv Owner", role: "publisher" },
        { clerkUserId: "clerk_vv_approved", email: "vv-approved@example.com", fullName: "Val Approved", role: "reviewer" },
        { clerkUserId: "clerk_vv_pending", email: "vv-pending@example.com", fullName: "Pat Pending", role: "reviewer" },
        { clerkUserId: "clerk_vv_affiliated", email: "vv-affiliated@example.com", fullName: "Sam Affiliated", role: "reviewer" },
        { clerkUserId: "clerk_vv_plain", email: "vv-plain@example.com", fullName: "Casey Plain", role: "publisher" },
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
        clerkOrgId: "org_vv",
        organizationName: "Vv Org",
        displayName: "Vv Publisher",
        website: "https://vv.example",
        description: "d",
        verificationStatus: "verified",
      })
      .returning();
    publisherId = publisher!.id;

    await ctx.db.insert(schema.publisherMembers).values([
      { publisherId, accountId: owner!.id, role: "owner" },
      // Structural affiliation — the conflict of interest the version:verify gate
      // must block, exactly as it blocks review:create.
      { publisherId, accountId: affiliatedRev!.id, role: "member" },
    ]);

    await ctx.db.insert(schema.reviewers).values([
      {
        accountId: approvedRev!.id,
        affiliation: "Independent",
        expertise: "Elections",
        applicationReason: "r",
        title: "Elections Reviewer",
        pseudonym: "The Auditor",
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
        affiliation: "Vv Org",
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

  async function publishArticle(headline = "Verifiable") {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { publisherId, category: "science", headline, summary: "s", content: "c", authorName: "a", submit: true },
    });
    expect(res.statusCode).toBe(201);
    return { articleId: res.json().article.id as string, versionId: res.json().version.id as string };
  }

  async function createDraft() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { publisherId, category: "science", headline: "D", summary: "s", content: "c", authorName: "a", submit: false },
    });
    return res.json().version.id as string;
  }

  function verify(versionId: string, token: string | null) {
    return ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/verify`,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });
  }

  function getVerification(articleId: string) {
    return ctx.app.inject({ method: "GET", url: `/articles/${articleId}/verification` });
  }

  describe("POST /versions/:versionId/verify", () => {
    it("401s without an Authorization header", async () => {
      const { versionId } = await publishArticle();
      const res = await verify(versionId, null);
      expect(res.statusCode).toBe(401);
    });

    it("404s for an unknown version", async () => {
      const res = await verify("00000000-0000-0000-0000-000000000000", approvedReviewerToken);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("404s for a draft version — its existence is not leaked", async () => {
      const versionId = await createDraft();
      const res = await verify(versionId, approvedReviewerToken);
      expect(res.statusCode).toBe(404);
    });

    it("403s when the actor is not a reviewer at all", async () => {
      const { versionId } = await publishArticle();
      const res = await verify(versionId, plainToken);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("403s when the actor is an unapproved (pending) reviewer", async () => {
      const { versionId } = await publishArticle();
      const res = await verify(versionId, pendingReviewerToken);
      expect(res.statusCode).toBe(403);
    });

    it("403s when the reviewer is structurally affiliated with the publisher (conflict of interest)", async () => {
      const { versionId } = await publishArticle();
      const res = await verify(versionId, affiliatedReviewerToken);
      expect(res.statusCode).toBe(403);
    });

    it("201s for an approved, non-affiliated reviewer and exposes only the public identity", async () => {
      const { versionId } = await publishArticle();
      const res = await verify(versionId, approvedReviewerToken);
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        articleVersionId: versionId,
        verifiedBy: { displayName: "The Auditor", title: "Elections Reviewer" },
      });
      expect(body.verifiedBy).not.toHaveProperty("fullName");
      expect(body.createdAt).toBeTypeOf("string");

      const rows = await ctx.db
        .select()
        .from(schema.versionVerifications)
        .where(eq(schema.versionVerifications.articleVersionId, versionId));
      expect(rows).toHaveLength(1);
    });

    it("409s on a second verification of the same version", async () => {
      const { versionId } = await publishArticle();
      expect((await verify(versionId, approvedReviewerToken)).statusCode).toBe(201);
      const second = await verify(versionId, approvedReviewerToken);
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("append-only invariant", () => {
    it("rejects UPDATE and DELETE against version_verifications", async () => {
      const { versionId } = await publishArticle();
      expect((await verify(versionId, approvedReviewerToken)).statusCode).toBe(201);

      await expect(
        ctx.db
          .update(schema.versionVerifications)
          .set({ articleVersionId: versionId })
          .where(eq(schema.versionVerifications.articleVersionId, versionId)),
      ).rejects.toThrow(/append-only/);

      await expect(
        ctx.db
          .delete(schema.versionVerifications)
          .where(eq(schema.versionVerifications.articleVersionId, versionId)),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe("effect on GET /articles/:articleId/verification", () => {
    it("moves a just-submitted v1.0 from authentic_under_review to authentic once verified", async () => {
      const { articleId, versionId } = await publishArticle();

      let body = (await getVerification(articleId)).json();
      expect(body.trustStatus).toBe("authentic_under_review");
      expect(body.currentVersion.reviewStatus).toBe("pending_review");

      expect((await verify(versionId, approvedReviewerToken)).statusCode).toBe(201);

      body = (await getVerification(articleId)).json();
      expect(body.trustStatus).toBe("authentic");
      expect(body.currentVersion.reviewStatus).toBe("verified");
      expect(body.versionHistory[0].reviewStatus).toBe("verified");
    });

    it("reports updated when a verified current version is past v1.0", async () => {
      const { articleId, versionId } = await publishArticle("Corrected");
      const correction = await ctx.app.inject({
        method: "POST",
        url: `/articles/${articleId}/versions`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          headline: "Corrected",
          summary: "s",
          content: "c2",
          authorName: "a",
          changeType: "minor_correction",
          changeSummary: "fixed a figure",
          submit: true,
        },
      });
      expect(correction.statusCode).toBe(201);
      const v2Id = correction.json().id as string;
      expect(v2Id).not.toBe(versionId);

      expect((await verify(v2Id, approvedReviewerToken)).statusCode).toBe(201);

      const body = (await getVerification(articleId)).json();
      expect(body.trustStatus).toBe("updated");
      expect(body.currentVersion.reviewStatus).toBe("verified");
    });

    it("keeps disputed outranking a verification while the dispute is open", async () => {
      const { articleId, versionId } = await publishArticle("Contested");
      expect((await verify(versionId, approvedReviewerToken)).statusCode).toBe(201);

      const filed = await ctx.app.inject({
        method: "POST",
        url: `/versions/${versionId}/disputes`,
        headers: { authorization: `Bearer ${approvedReviewerToken}` },
        payload: { reason: "A cited number is wrong." },
      });
      expect(filed.statusCode).toBe(201);

      const body = (await getVerification(articleId)).json();
      expect(body.trustStatus).toBe("disputed");
      // The version is still verified underneath — the status is precedence, not a downgrade.
      expect(body.currentVersion.reviewStatus).toBe("verified");
    });

    it("raises the publisher credibility score, since verifiedRatio now counts it", async () => {
      // Isolated publisher so the aggregate is only this one article.
      const [acct] = await ctx.db
        .insert(schema.accounts)
        .values({ clerkUserId: "clerk_vv_cred", email: "vv-cred@example.com", fullName: "Cred Owner", role: "publisher" })
        .returning();
      const [pub] = await ctx.db
        .insert(schema.publishers)
        .values({
          clerkOrgId: "org_vv_cred",
          organizationName: "Cred Org",
          displayName: "Cred",
          website: "https://cred.example",
          description: "d",
          verificationStatus: "verified",
        })
        .returning();
      await ctx.db.insert(schema.publisherMembers).values({ publisherId: pub!.id, accountId: acct!.id, role: "owner" });

      const create = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${acct!.clerkUserId}` },
        payload: { publisherId: pub!.id, category: "science", headline: "Solo", summary: "s", content: "c", authorName: "a", submit: true },
      });
      const articleId = create.json().article.id as string;
      const versionId = create.json().version.id as string;

      // 1 article, 0 verified, 0 disputes, 0 corrections -> 60.
      expect((await getVerification(articleId)).json().publisher.credibilityScore).toBe(60);

      expect((await verify(versionId, approvedReviewerToken)).statusCode).toBe(201);

      // 1 article, 1 verified -> 60 + 40*1 = 100.
      expect((await getVerification(articleId)).json().publisher.credibilityScore).toBe(100);
    });
  });
});
