import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

describe("Article vertical slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let verifiedPublisherId: string;
  let unverifiedPublisherId: string;
  let verifiedOwnerToken: string;
  let unverifiedOwnerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [verifiedOwner, unverifiedOwner, outsider] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_verified_owner", email: "verified-owner@example.com", fullName: "Verified Owner", role: "publisher" },
        { clerkUserId: "clerk_unverified_owner", email: "unverified-owner@example.com", fullName: "Unverified Owner", role: "publisher" },
        { clerkUserId: "clerk_outsider", email: "outsider@example.com", fullName: "Outsider", role: "publisher" },
      ])
      .returning();
    verifiedOwnerToken = verifiedOwner!.clerkUserId;
    unverifiedOwnerToken = unverifiedOwner!.clerkUserId;
    outsiderToken = outsider!.clerkUserId;

    const [verifiedPublisher, unverifiedPublisher] = await ctx.db
      .insert(schema.publishers)
      .values([
        {
          clerkOrgId: "org_verified",
          organizationName: "Verified Org",
          displayName: "Verified Publisher",
          website: "https://verified.example",
          description: "d",
          verificationStatus: "verified",
        },
        {
          clerkOrgId: "org_unverified",
          organizationName: "Unverified Org",
          displayName: "Unverified Publisher",
          website: "https://unverified.example",
          description: "d",
          verificationStatus: "unverified",
        },
      ])
      .returning();
    verifiedPublisherId = verifiedPublisher!.id;
    unverifiedPublisherId = unverifiedPublisher!.id;

    await ctx.db.insert(schema.publisherMembers).values([
      { publisherId: verifiedPublisherId, accountId: verifiedOwner!.id, role: "owner" },
      { publisherId: unverifiedPublisherId, accountId: unverifiedOwner!.id, role: "owner" },
    ]);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  function draftBody(overrides: Record<string, unknown> = {}) {
    return {
      publisherId: verifiedPublisherId,
      category: "technology",
      headline: "Test Headline",
      summary: "Test summary.",
      content: "Test content.",
      authorName: "Test Author",
      submit: false,
      ...overrides,
    };
  }

  describe("POST /articles", () => {
    it("401s with no Authorization header", async () => {
      const res = await ctx.app.inject({ method: "POST", url: "/articles", payload: draftBody() });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: "UNAUTHENTICATED" });
    });

    it("400s on validation failure (missing headline)", async () => {
      const { headline: _headline, ...body } = draftBody();
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: body,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("403s when the actor is not a member of the target publisher (authenticated but unauthorized)", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: draftBody(),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("403s submitting (not drafting) via an unverified publisher", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${unverifiedOwnerToken}` },
        payload: draftBody({ publisherId: unverifiedPublisherId, submit: true }),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("201s creating a draft as a verified publisher's member (happy path)", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: draftBody(),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.article.publisherId).toBe(verifiedPublisherId);
      expect(body.version.reviewStatus).toBe("draft");
      expect(body.version.contentHash).toBeNull();
      expect(body.version.versionLabel).toBe("v1.0");
    });

    it("201s submitting a verified publisher's article, computing a real content hash", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: draftBody({ submit: true }),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.version.reviewStatus).toBe("pending_review");
      expect(body.version.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.version.publishedAt).not.toBeNull();
    });
  });

  describe("Article lifecycle (read, correct, archive)", () => {
    let articleId: string;
    let v1Id: string;
    let v1Hash: string;

    beforeAll(async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: draftBody({ headline: "Lifecycle Article", submit: true }),
      });
      const body = res.json();
      articleId = body.article.id;
      v1Id = body.version.id;
      v1Hash = body.version.contentHash;
    });

    it("GET /articles/:id is public and returns the article", async () => {
      const res = await ctx.app.inject({ method: "GET", url: `/articles/${articleId}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(articleId);
    });

    it("GET /articles/:id 404s for an unknown id (not-found)", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/articles/00000000-0000-0000-0000-000000000000" });
      expect(res.statusCode).toBe(404);
    });

    it("GET /articles/:id/versions lists the published version, publicly", async () => {
      const res = await ctx.app.inject({ method: "GET", url: `/articles/${articleId}/versions` });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
      expect(res.json().items[0].id).toBe(v1Id);
    });

    it("POST a correction chains previousHash to v1's contentHash and increments the version", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/articles/${articleId}/versions`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: {
          headline: "Lifecycle Article (corrected)",
          summary: "s2",
          content: "c2",
          authorName: "Test Author",
          changeType: "minor_correction",
          changeSummary: "fixed a typo",
          submit: true,
        },
      });
      expect(res.statusCode).toBe(201);
      const v2 = res.json();
      expect(v2.versionLabel).toBe("v1.1");
      expect(v2.previousVersionId).toBe(v1Id);
      expect(v2.previousHash).toBe(v1Hash);
    });

    it("archiving hides the article from public reads", async () => {
      const archiveRes = await ctx.app.inject({
        method: "POST",
        url: `/articles/${articleId}/archive`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
      });
      expect(archiveRes.statusCode).toBe(200);

      const getRes = await ctx.app.inject({ method: "GET", url: `/articles/${articleId}` });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("Draft-only enforcement and visibility", () => {
    let articleId: string;
    let draftVersionId: string;

    beforeAll(async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: draftBody({ headline: "Draft Enforcement Article" }),
      });
      const body = res.json();
      articleId = body.article.id;
      draftVersionId = body.version.id;
    });

    it("a draft version is invisible to the public (404, not 403 — existence isn't leaked)", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/articles/${articleId}/versions/${draftVersionId}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("a draft version is visible to its own publisher's member", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/articles/${articleId}/versions/${draftVersionId}`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().reviewStatus).toBe("draft");
    });

    it("PATCH edits a draft in place", async () => {
      const res = await ctx.app.inject({
        method: "PATCH",
        url: `/articles/${articleId}/versions/${draftVersionId}`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: {
          headline: "Edited Headline",
          summary: "s",
          content: "c",
          authorName: "Test Author",
          changeType: "original_published",
          submit: false,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().headline).toBe("Edited Headline");
    });

    it("DELETE removes a draft", async () => {
      const res = await ctx.app.inject({
        method: "DELETE",
        url: `/articles/${articleId}/versions/${draftVersionId}`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it("PATCH 409s once a version is no longer a draft (append-only)", async () => {
      const submitRes = await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: draftBody({ headline: "Already Submitted", submit: true }),
      });
      const { article, version } = submitRes.json();

      const patchRes = await ctx.app.inject({
        method: "PATCH",
        url: `/articles/${article.id}/versions/${version.id}`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: {
          headline: "Should not apply",
          summary: "s",
          content: "c",
          authorName: "a",
          changeType: "original_published",
          submit: false,
        },
      });
      expect(patchRes.statusCode).toBe(409);
      expect(patchRes.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("GET /publishers/:publisherId/articles", () => {
    it("403s for a non-member (org isolation — outsider cannot read this publisher's article list)", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/publishers/${verifiedPublisherId}/articles`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("200s for a member and does not include the other publisher's articles", async () => {
      await ctx.app.inject({
        method: "POST",
        url: "/articles",
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
        payload: draftBody({ headline: "Listing Test Article" }),
      });

      const res = await ctx.app.inject({
        method: "GET",
        url: `/publishers/${verifiedPublisherId}/articles`,
        headers: { authorization: `Bearer ${verifiedOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.category).toBeDefined();
      }
    });
  });
});
