import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

describe("Self-service registration", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startTestApp();
    const [admin] = await ctx.db
      .insert(schema.accounts)
      .values({ clerkUserId: "clerk_rg_admin", email: "rg-admin@example.com", fullName: "Reg Admin", role: "admin" })
      .returning();
    adminToken = admin!.clerkUserId;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const publisherBody = (over: Record<string, unknown> = {}) => ({
    fullName: "Paula Publisher",
    email: "paula@news.example",
    organizationName: "Paula News",
    website: "https://paula.news",
    description: "An independent newsroom.",
    ...over,
  });

  const reviewerBody = (over: Record<string, unknown> = {}) => ({
    fullName: "Riley Reviewer",
    email: "riley@uni.example",
    affiliation: "State University",
    expertise: "Climate policy",
    applicationReason: "I want to help keep reporting accurate.",
    ...over,
  });

  describe("POST /publishers", () => {
    it("401s without a session", async () => {
      const res = await ctx.app.inject({ method: "POST", url: "/publishers", payload: publisherBody() });
      expect(res.statusCode).toBe(401);
    });

    it("400s on a malformed body", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/publishers",
        headers: { authorization: "Bearer clerk_rg_p_bad" },
        payload: publisherBody({ email: "not-an-email" }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("materializes the account, creates the publisher, and adds the caller as owner", async () => {
      const token = "clerk_rg_p1";
      const res = await ctx.app.inject({
        method: "POST",
        url: "/publishers",
        headers: { authorization: `Bearer ${token}` },
        payload: publisherBody(),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        organizationName: "Paula News",
        displayName: "Paula News",
        verificationStatus: "unverified",
        credibilityScore: 0,
        transparencyLevel: 3,
      });

      const [account] = await ctx.db.select().from(schema.accounts).where(eq(schema.accounts.clerkUserId, token));
      expect(account).toMatchObject({ email: "paula@news.example", fullName: "Paula Publisher", role: "publisher" });

      const [publisher] = await ctx.db.select().from(schema.publishers).where(eq(schema.publishers.id, body.id));
      expect(publisher!.clerkOrgId).toMatch(/^local_org_/);

      const [member] = await ctx.db
        .select()
        .from(schema.publisherMembers)
        .where(
          and(eq(schema.publisherMembers.publisherId, body.id), eq(schema.publisherMembers.accountId, account!.id)),
        );
      expect(member!.role).toBe("owner");

      // GET /me now works for this session.
      const me = await ctx.app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(200);
      expect(me.json().publisherIds).toContain(body.id);
    });

    it("lets the same person register a second publisher, reusing their account row", async () => {
      const token = "clerk_rg_p2";
      const first = await ctx.app.inject({
        method: "POST",
        url: "/publishers",
        headers: { authorization: `Bearer ${token}` },
        payload: publisherBody({ email: "p2@news.example", organizationName: "First Org" }),
      });
      const second = await ctx.app.inject({
        method: "POST",
        url: "/publishers",
        headers: { authorization: `Bearer ${token}` },
        payload: publisherBody({ email: "p2@news.example", organizationName: "Second Org" }),
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(first.json().id).not.toBe(second.json().id);

      const accounts = await ctx.db.select().from(schema.accounts).where(eq(schema.accounts.clerkUserId, token));
      expect(accounts).toHaveLength(1);
    });

    it("409s when the email belongs to a different account", async () => {
      await ctx.app.inject({
        method: "POST",
        url: "/publishers",
        headers: { authorization: "Bearer clerk_rg_p3a" },
        payload: publisherBody({ email: "shared@news.example" }),
      });
      const res = await ctx.app.inject({
        method: "POST",
        url: "/publishers",
        headers: { authorization: "Bearer clerk_rg_p3b" },
        payload: publisherBody({ email: "shared@news.example" }),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("POST /reviewers/apply", () => {
    it("401s without a session", async () => {
      const res = await ctx.app.inject({ method: "POST", url: "/reviewers/apply", payload: reviewerBody() });
      expect(res.statusCode).toBe(401);
    });

    it("400s on a malformed body", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/reviewers/apply",
        headers: { authorization: "Bearer clerk_rg_r_bad" },
        payload: reviewerBody({ affiliation: "" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("creates a pending reviewer profile and shows it in the admin queue", async () => {
      const token = "clerk_rg_r1";
      const res = await ctx.app.inject({
        method: "POST",
        url: "/reviewers/apply",
        headers: { authorization: `Bearer ${token}` },
        payload: reviewerBody(),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        affiliation: "State University",
        expertise: "Climate policy",
        approvalStatus: "pending",
      });

      const [account] = await ctx.db.select().from(schema.accounts).where(eq(schema.accounts.clerkUserId, token));
      expect(account!.role).toBe("reviewer");

      const queue = await ctx.app.inject({
        method: "GET",
        url: "/reviewers/pending",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(queue.json().items.map((r: { id: string }) => r.id)).toContain(res.json().id);
    });

    it("409s a second application from the same account", async () => {
      const token = "clerk_rg_r2";
      const first = await ctx.app.inject({
        method: "POST",
        url: "/reviewers/apply",
        headers: { authorization: `Bearer ${token}` },
        payload: reviewerBody({ email: "r2@uni.example" }),
      });
      expect(first.statusCode).toBe(201);
      const second = await ctx.app.inject({
        method: "POST",
        url: "/reviewers/apply",
        headers: { authorization: `Bearer ${token}` },
        payload: reviewerBody({ email: "r2@uni.example" }),
      });
      expect(second.statusCode).toBe(409);
    });

    it("409s when the email belongs to a different account", async () => {
      await ctx.app.inject({
        method: "POST",
        url: "/reviewers/apply",
        headers: { authorization: "Bearer clerk_rg_r3a" },
        payload: reviewerBody({ email: "shared-rev@uni.example" }),
      });
      const res = await ctx.app.inject({
        method: "POST",
        url: "/reviewers/apply",
        headers: { authorization: "Bearer clerk_rg_r3b" },
        payload: reviewerBody({ email: "shared-rev@uni.example" }),
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
