import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

// POST /readers (self-service reader registration) + the six saved-article /
// publisher-follow endpoints (SavedArticles.tsx, TrustedPublishers.tsx).
describe("Reader slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let reader1Token: string;
  let reader2Token: string;
  let ownerToken: string;
  let reviewerToken: string;
  let adminToken: string;
  let publisherId: string;

  // articles created in beforeAll
  let authArticleId: string;
  let disputedArticleId: string;
  let draftArticleId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [reader1, reader2, owner, reviewer, admin] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_rdr_1", email: "rdr1@example.com", fullName: "Reed Uno", role: "reader" },
        { clerkUserId: "clerk_rdr_2", email: "rdr2@example.com", fullName: "Reed Dos", role: "reader" },
        { clerkUserId: "clerk_rdr_owner", email: "rdr-owner@example.com", fullName: "Rdr Owner", role: "publisher" },
        { clerkUserId: "clerk_rdr_rev", email: "rdr-rev@example.com", fullName: "Rae Reviewer", role: "reviewer" },
        { clerkUserId: "clerk_rdr_admin", email: "rdr-admin@example.com", fullName: "Ada Admin", role: "admin" },
      ])
      .returning();
    reader1Token = reader1!.clerkUserId;
    reader2Token = reader2!.clerkUserId;
    ownerToken = owner!.clerkUserId;
    reviewerToken = reviewer!.clerkUserId;
    adminToken = admin!.clerkUserId;

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_rdr",
        organizationName: "Rdr Org",
        displayName: "Reader Test Publisher",
        website: "https://rdr.example",
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

    authArticleId = (await publish("Authentic one")).articleId;
    const authVersionId = (await currentVersionId(authArticleId));
    // verify it -> trustStatus "authentic"
    expect(
      (await ctx.app.inject({
        method: "POST",
        url: `/versions/${authVersionId}/verify`,
        headers: auth(reviewerToken),
      })).statusCode,
    ).toBe(201);

    const disputed = await publish("Disputed one");
    disputedArticleId = disputed.articleId;
    expect(
      (await ctx.app.inject({
        method: "POST",
        url: `/versions/${disputed.versionId}/disputes`,
        headers: auth(reviewerToken),
        payload: { reason: "A figure is wrong." },
      })).statusCode,
    ).toBe(201);

    const draft = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: auth(ownerToken),
      payload: { publisherId, category: "science", headline: "Draft", summary: "s", content: "c", authorName: "a", submit: false },
    });
    draftArticleId = draft.json().article.id;
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

  async function currentVersionId(articleId: string) {
    const res = await ctx.app.inject({ method: "GET", url: `/articles/${articleId}/versions` });
    return res.json().items[0].id as string;
  }

  const save = (articleId: string, token: string) =>
    ctx.app.inject({ method: "POST", url: "/saved-articles", headers: auth(token), payload: { articleId } });
  const follow = (pubId: string, token: string) =>
    ctx.app.inject({ method: "POST", url: "/publisher-follows", headers: auth(token), payload: { publisherId: pubId } });
  const listSaved = (token: string, qs = "") =>
    ctx.app.inject({ method: "GET", url: `/saved-articles${qs}`, headers: auth(token) });

  describe("POST /readers", () => {
    it("401s without a session", async () => {
      const res = await ctx.app.inject({ method: "POST", url: "/readers", payload: { fullName: "N", email: "n@example.com" } });
      expect(res.statusCode).toBe(401);
    });

    it("400s a malformed body", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/readers",
        headers: auth("clerk_brand_new_reader"),
        payload: { fullName: "N", email: "not-an-email" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("201s, materializes the account, and GET /me then works", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/readers",
        headers: auth("clerk_brand_new_reader"),
        payload: { fullName: "Nova Reader", email: "nova@example.com" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ email: "nova@example.com", fullName: "Nova Reader", role: "reader" });

      const me = await ctx.app.inject({ method: "GET", url: "/me", headers: auth("clerk_brand_new_reader") });
      expect(me.statusCode).toBe(200);
      expect(me.json().account.role).toBe("reader");
    });

    it("is idempotent for a repeat call from the same session", async () => {
      const first = await ctx.app.inject({
        method: "POST",
        url: "/readers",
        headers: auth("clerk_repeat_reader"),
        payload: { fullName: "Repeat", email: "repeat@example.com" },
      });
      const second = await ctx.app.inject({
        method: "POST",
        url: "/readers",
        headers: auth("clerk_repeat_reader"),
        payload: { fullName: "Repeat Changed", email: "repeat@example.com" },
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().id).toBe(first.json().id);
      expect(second.json().fullName).toBe("Repeat"); // ensureAccount never overwrites
    });

    it("409s when the email belongs to a different clerk user", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/readers",
        headers: auth("clerk_someone_else"),
        payload: { fullName: "Imposter", email: "rdr1@example.com" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /saved-articles", () => {
    it("401s without a session and 401s a valid session with no account", async () => {
      expect((await ctx.app.inject({ method: "GET", url: "/saved-articles" })).statusCode).toBe(401);
      const noAccount = await ctx.app.inject({ method: "GET", url: "/saved-articles", headers: auth("clerk_ghost") });
      expect(noAccount.statusCode).toBe(401);
    });

    it("returns an empty page for a reader with nothing saved", async () => {
      const res = await listSaved(reader2Token);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [], nextCursor: null });
    });

    it("denormalizes each row with a real per-article trustStatus", async () => {
      expect((await save(authArticleId, reader1Token)).statusCode).toBe(201);
      expect((await save(disputedArticleId, reader1Token)).statusCode).toBe(201);

      const body = (await listSaved(reader1Token)).json();
      const byArticle = Object.fromEntries(body.items.map((s: { articleId: string }) => [s.articleId, s]));
      expect(byArticle[authArticleId]).toMatchObject({
        publisherName: "Reader Test Publisher",
        title: "Authentic one",
        trustStatus: "authentic",
      });
      expect(byArticle[authArticleId].savedAt).toBeTypeOf("string");
      expect(byArticle[disputedArticleId].trustStatus).toBe("disputed");
    });

    it("walks pages by cursor without overlap", async () => {
      const token = "clerk_pager_reader";
      await ctx.app.inject({ method: "POST", url: "/readers", headers: auth(token), payload: { fullName: "Pager", email: "pager@example.com" } });
      for (const h of ["p one", "p two", "p three"]) {
        expect((await save((await publish(h)).articleId, token)).statusCode).toBe(201);
      }
      const page1 = (await listSaved(token, "?limit=2")).json();
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeTypeOf("string");
      const page2 = (await listSaved(token, `?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`)).json();
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      const ids = [...page1.items, ...page2.items].map((s: { id: string }) => s.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("POST /saved-articles", () => {
    it("401s without a session", async () => {
      const res = await ctx.app.inject({ method: "POST", url: "/saved-articles", payload: { articleId: authArticleId } });
      expect(res.statusCode).toBe(401);
    });

    it("404s an unknown, an archived, and a draft-only article", async () => {
      expect((await save("00000000-0000-0000-0000-000000000000", reader2Token)).statusCode).toBe(404);
      expect((await save(draftArticleId, reader2Token)).statusCode).toBe(404);

      const { articleId } = await publish("To be archived");
      await ctx.app.inject({ method: "POST", url: `/articles/${articleId}/archive`, headers: auth(ownerToken) });
      expect((await save(articleId, reader2Token)).statusCode).toBe(404);
    });

    it("201s with the denormalized shape and 409s a duplicate", async () => {
      const { articleId } = await publish("Save me once");
      const res = await save(articleId, reader2Token);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ articleId, title: "Save me once", publisherName: "Reader Test Publisher" });
      expect(res.json().trustStatus).toBeTypeOf("string");

      const dup = await save(articleId, reader2Token);
      expect(dup.statusCode).toBe(409);
      expect(dup.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("DELETE /saved-articles/:savedArticleId", () => {
    it("404s an unknown id, 403s another reader's row, 204s the owner's", async () => {
      const { articleId } = await publish("Delete target");
      const saved = (await save(articleId, reader1Token)).json();

      expect(
        (await ctx.app.inject({ method: "DELETE", url: "/saved-articles/00000000-0000-0000-0000-000000000000", headers: auth(reader1Token) })).statusCode,
      ).toBe(404);
      expect(
        (await ctx.app.inject({ method: "DELETE", url: `/saved-articles/${saved.id}`, headers: auth(reader2Token) })).statusCode,
      ).toBe(403);

      const del = await ctx.app.inject({ method: "DELETE", url: `/saved-articles/${saved.id}`, headers: auth(reader1Token) });
      expect(del.statusCode).toBe(204);
      const stillThere = (await listSaved(reader1Token)).json().items.some((s: { id: string }) => s.id === saved.id);
      expect(stillThere).toBe(false);
    });
  });

  describe("publisher follows", () => {
    it("401s an unauthenticated list", async () => {
      expect((await ctx.app.inject({ method: "GET", url: "/publisher-follows" })).statusCode).toBe(401);
    });

    it("404s following an unknown publisher", async () => {
      expect((await follow("00000000-0000-0000-0000-000000000000", reader1Token)).statusCode).toBe(404);
    });

    it("201s a follow, lists it with verified + credibilityScore, 409s a duplicate", async () => {
      const res = await follow(publisherId, reader1Token);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ publisherId, publisherName: "Reader Test Publisher", verified: true });
      expect(res.json().credibilityScore).toBeTypeOf("number");
      expect(res.json().credibilityScore).toBeGreaterThanOrEqual(0);
      expect(res.json().credibilityScore).toBeLessThanOrEqual(100);

      expect((await follow(publisherId, reader1Token)).statusCode).toBe(409);

      const list = (await ctx.app.inject({ method: "GET", url: "/publisher-follows", headers: auth(reader1Token) })).json();
      expect(list.items.some((f: { publisherId: string }) => f.publisherId === publisherId)).toBe(true);
    });

    it("403s unfollowing another reader's row, 204s the owner's", async () => {
      const mine = (await follow(publisherId, reader2Token)).json();
      expect(
        (await ctx.app.inject({ method: "DELETE", url: `/publisher-follows/${mine.id}`, headers: auth(reader1Token) })).statusCode,
      ).toBe(403);
      expect(
        (await ctx.app.inject({ method: "DELETE", url: `/publisher-follows/${mine.id}`, headers: auth(reader2Token) })).statusCode,
      ).toBe(204);
    });
  });

  describe("redaction interaction", () => {
    it("blanks the title of a saved article whose current version is redacted", async () => {
      const { articleId, versionId } = await publish("Will be redacted");
      expect((await save(articleId, reader1Token)).statusCode).toBe(201);

      expect(
        (await ctx.app.inject({
          method: "POST",
          url: `/versions/${versionId}/redaction`,
          headers: auth(adminToken),
          payload: { category: "court_order", reason: "order 1" },
        })).statusCode,
      ).toBe(201);

      const row = (await listSaved(reader1Token)).json().items.find((s: { articleId: string }) => s.articleId === articleId);
      expect(row.title).toBe("");
    });
  });
});
