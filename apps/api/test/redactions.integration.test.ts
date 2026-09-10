import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

// GET  /versions/:versionId/redaction  — public tombstone (or 404)
// POST /versions/:versionId/redaction  — admin only, legal takedown. Redaction
// is read-layer suppression: the article_versions row is never modified, the
// tombstone is permanent (append-only), and the version's own content is nulled
// on every public read while its position, hashes and timestamps remain.
describe("Redaction slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let adminToken: string;
  let ownerToken: string;
  let reviewerToken: string;
  let publisherId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [admin, owner, reviewer] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_rd_admin", email: "rd-admin@example.com", fullName: "Ada Admin", role: "admin" },
        { clerkUserId: "clerk_rd_owner", email: "rd-owner@example.com", fullName: "Rd Owner", role: "publisher" },
        { clerkUserId: "clerk_rd_rev", email: "rd-rev@example.com", fullName: "Rae Reviewer", role: "reviewer" },
      ])
      .returning();
    adminToken = admin!.clerkUserId;
    ownerToken = owner!.clerkUserId;
    reviewerToken = reviewer!.clerkUserId;

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_rd",
        organizationName: "Rd Org",
        displayName: "Rd Publisher",
        website: "https://rd.example",
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
      approvalStatus: "approved",
      approvedAt: new Date(),
    });
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  async function publishArticle(headline = "Takedown target") {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: auth(ownerToken),
      payload: {
        publisherId,
        category: "science",
        headline,
        summary: "the summary",
        content: "the body",
        authorName: "A. Writer",
        tags: ["t1"],
        sourceLinks: ["https://src.example/1"],
        submit: true,
      },
    });
    expect(res.statusCode).toBe(201);
    return { articleId: res.json().article.id as string, versionId: res.json().version.id as string };
  }

  async function correction(articleId: string) {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/articles/${articleId}/versions`,
      headers: auth(ownerToken),
      payload: {
        headline: "Takedown target (corrected)",
        summary: "s2",
        content: "c2",
        authorName: "A. Writer",
        changeType: "minor_correction",
        changeSummary: "fixed a detail",
        submit: true,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function createDraft() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: auth(ownerToken),
      payload: { publisherId, category: "science", headline: "D", summary: "s", content: "c", authorName: "a", submit: false },
    });
    return res.json().version.id as string;
  }

  function redact(
    versionId: string,
    token: string | null,
    body: Record<string, unknown> = { category: "court_order", reason: "Docket 12-CV-345, sealed order" },
  ) {
    return ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/redaction`,
      ...(token ? { headers: auth(token) } : {}),
      payload: body,
    });
  }

  const getVersion = (articleId: string, versionId: string) =>
    ctx.app.inject({ method: "GET", url: `/articles/${articleId}/versions/${versionId}` });
  const getVerification = (articleId: string) =>
    ctx.app.inject({ method: "GET", url: `/articles/${articleId}/verification` });

  const BLANKED = ["headline", "summary", "content", "authorName", "tags", "sourceLinks"] as const;

  describe("POST /versions/:versionId/redaction", () => {
    it("401s without a token", async () => {
      const { versionId } = await publishArticle();
      expect((await redact(versionId, null)).statusCode).toBe(401);
    });

    it("403s a non-admin (a publisher owner)", async () => {
      const { versionId } = await publishArticle();
      const res = await redact(versionId, ownerToken);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("404s an unknown version", async () => {
      const res = await redact("00000000-0000-0000-0000-000000000000", adminToken);
      expect(res.statusCode).toBe(404);
    });

    it("404s a draft version — its existence is not leaked", async () => {
      const res = await redact(await createDraft(), adminToken);
      expect(res.statusCode).toBe(404);
    });

    it("400s a bad body (missing reason)", async () => {
      const { versionId } = await publishArticle();
      const res = await redact(versionId, adminToken, { category: "court_order" });
      expect(res.statusCode).toBe(400);
    });

    it("201s for an admin: tombstone only, hash = the version's anchored contentHash, legal reason withheld", async () => {
      const { articleId, versionId } = await publishArticle();
      const contentHash = getVersion(articleId, versionId).then((r) => r.json().contentHash as string);

      const res = await redact(versionId, adminToken, { category: "defamation_ruling", reason: "Ruling of 2026-08-01" });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toEqual({
        articleVersionId: versionId,
        category: "defamation_ruling",
        tombstoneHash: await contentHash,
        redactedAt: expect.any(String),
      });
      expect(body).not.toHaveProperty("reason");

      const [row] = await ctx.db
        .select()
        .from(schema.redactions)
        .where(eq(schema.redactions.articleVersionId, versionId));
      expect(row!.reason).toBe("Ruling of 2026-08-01");
      expect(row!.redactedByAccountId).toBeTypeOf("string");
    });

    it("409s a second redaction of the same version", async () => {
      const { versionId } = await publishArticle();
      expect((await redact(versionId, adminToken)).statusCode).toBe(201);
      const second = await redact(versionId, adminToken);
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("GET /versions/:versionId/redaction", () => {
    it("404s a version that is not redacted", async () => {
      const { versionId } = await publishArticle();
      const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/redaction` });
      expect(res.statusCode).toBe(404);
    });

    it("returns the public tombstone once redacted, with no legal reason", async () => {
      const { versionId } = await publishArticle();
      await redact(versionId, adminToken, { category: "right_to_erasure", reason: "GDPR Art. 17 request #88" });
      const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/redaction` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        articleVersionId: versionId,
        category: "right_to_erasure",
        tombstoneHash: expect.any(String),
        redactedAt: expect.any(String),
      });
      expect(res.json()).not.toHaveProperty("reason");
    });
  });

  describe("content suppression on the public reads", () => {
    it("blanks the version body on GET /articles/:id/versions/:versionId, keeping position + hashes", async () => {
      const { articleId, versionId } = await publishArticle();
      const before = (await getVersion(articleId, versionId)).json();
      await redact(versionId, adminToken);

      const after = (await getVersion(articleId, versionId)).json();
      for (const f of BLANKED) expect(after[f]).toBeNull();
      expect(after.versionLabel).toBe(before.versionLabel);
      expect(after.reviewStatus).toBe(before.reviewStatus);
      expect(after.contentHash).toBe(before.contentHash);
      expect(after.previousHash).toBe(before.previousHash);
      expect(after.changeType).toBe(before.changeType);
      expect(after.redaction).toEqual({
        articleVersionId: versionId,
        category: "court_order",
        tombstoneHash: before.contentHash,
        redactedAt: expect.any(String),
      });
    });

    it("blanks only the redacted entry in GET /articles/:id/versions", async () => {
      const { articleId, versionId: v1 } = await publishArticle();
      const v2 = await correction(articleId);
      await redact(v1, adminToken);

      const res = await ctx.app.inject({ method: "GET", url: `/articles/${articleId}/versions` });
      const byId = Object.fromEntries(res.json().items.map((v: { id: string }) => [v.id, v]));
      for (const f of BLANKED) expect(byId[v1][f]).toBeNull();
      expect(byId[v1].redaction).not.toBeNull();
      expect(byId[v2].headline).not.toBeNull();
      expect(byId[v2].redaction).toBeNull();
    });

    it("blanks the current version in GET /articles/:id/verification and sets the top-level redaction", async () => {
      const { articleId, versionId } = await publishArticle();
      await redact(versionId, adminToken);

      const res = await getVerification(articleId);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const f of BLANKED) expect(body.currentVersion[f]).toBeNull();
      expect(body.currentVersion.redaction).not.toBeNull();
      expect(body.currentVersion.contentHash).not.toBeNull();
      expect(body.redaction).toMatchObject({ articleVersionId: versionId, category: "court_order" });
      expect(body.versionHistory[0].redaction).not.toBeNull();
      // Redaction does not erase the trust computation — the record still resolves.
      expect(typeof body.trustStatus).toBe("string");
      expect(body.trustStatus).not.toBe("notfound");
    });

    it("blanks a redacted PAST version in versionHistory while the current version stays served", async () => {
      const { articleId, versionId: v1 } = await publishArticle();
      const v2 = await correction(articleId);
      await redact(v1, adminToken);

      const body = (await getVerification(articleId)).json();
      expect(body.currentVersion.id).toBe(v2);
      expect(body.currentVersion.headline).not.toBeNull();
      expect(body.redaction).toBeNull(); // current version is not redacted
      const historyV1 = body.versionHistory.find((v: { id: string }) => v.id === v1);
      for (const f of BLANKED) expect(historyV1[f]).toBeNull();
      expect(historyV1.redaction).toMatchObject({ articleVersionId: v1, category: "court_order" });
    });
  });

  describe("what redaction does NOT suppress", () => {
    it("leaves the version's reviews, anchor record and dispute list public", async () => {
      const { articleId, versionId } = await publishArticle();
      await ctx.app.inject({
        method: "POST",
        url: `/versions/${versionId}/reviews`,
        headers: auth(reviewerToken),
        payload: { type: "confirmation", comment: "Checked before the takedown." },
      });

      await redact(versionId, adminToken);

      const reviews = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/reviews` });
      expect(reviews.statusCode).toBe(200);
      expect(reviews.json().items).toHaveLength(1);
      expect(reviews.json().items[0].comment).toBe("Checked before the takedown.");

      const anchor = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/anchor` });
      expect(anchor.statusCode).toBe(200);

      const disputes = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/disputes` });
      expect(disputes.statusCode).toBe(200);

      // The verification response still carries that review.
      const body = (await getVerification(articleId)).json();
      expect(body.reviews).toHaveLength(1);
    });
  });

  describe("append-only invariant", () => {
    it("rejects UPDATE and DELETE against redactions", async () => {
      const { versionId } = await publishArticle();
      await redact(versionId, adminToken);

      await expect(
        ctx.db.update(schema.redactions).set({ reason: "tampered" }).where(eq(schema.redactions.articleVersionId, versionId)),
      ).rejects.toThrow(/append-only/);
      await expect(
        ctx.db.delete(schema.redactions).where(eq(schema.redactions.articleVersionId, versionId)),
      ).rejects.toThrow(/append-only/);
    });
  });
});
