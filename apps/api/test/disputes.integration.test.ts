import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

describe("Dispute vertical slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let filerToken: string;
  let otherReviewerToken: string;
  let affiliatedReviewerToken: string;
  let pendingReviewerToken: string;
  let adminToken: string;
  let plainToken: string;
  let publisherId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [owner, filer, other, affiliated, pending, admin, plain] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_dp_owner", email: "dp-owner@example.com", fullName: "Dp Owner", role: "publisher" },
        { clerkUserId: "clerk_dp_filer", email: "dp-filer@example.com", fullName: "Fran Filer", role: "reviewer" },
        { clerkUserId: "clerk_dp_other", email: "dp-other@example.com", fullName: "Ollie Other", role: "reviewer" },
        { clerkUserId: "clerk_dp_affil", email: "dp-affil@example.com", fullName: "Avery Affiliated", role: "reviewer" },
        { clerkUserId: "clerk_dp_pending", email: "dp-pending@example.com", fullName: "Pat Pending", role: "reviewer" },
        { clerkUserId: "clerk_dp_admin", email: "dp-admin@example.com", fullName: "Admin Ada", role: "admin" },
        { clerkUserId: "clerk_dp_plain", email: "dp-plain@example.com", fullName: "Casey Plain", role: "publisher" },
      ])
      .returning();
    ownerToken = owner!.clerkUserId;
    filerToken = filer!.clerkUserId;
    otherReviewerToken = other!.clerkUserId;
    affiliatedReviewerToken = affiliated!.clerkUserId;
    pendingReviewerToken = pending!.clerkUserId;
    adminToken = admin!.clerkUserId;
    plainToken = plain!.clerkUserId;

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_dp",
        organizationName: "Dp Org",
        displayName: "Dp Publisher",
        website: "https://dp.example",
        description: "d",
        verificationStatus: "verified",
      })
      .returning();
    publisherId = publisher!.id;

    await ctx.db.insert(schema.publisherMembers).values([
      { publisherId, accountId: owner!.id, role: "owner" },
      { publisherId, accountId: affiliated!.id, role: "member" },
    ]);

    await ctx.db.insert(schema.reviewers).values([
      { accountId: filer!.id, affiliation: "Independent", expertise: "X", applicationReason: "r", title: "Fact Checker", pseudonym: "Dr. Quill", useLegalName: false, approvalStatus: "approved", approvedAt: new Date() },
      { accountId: other!.id, affiliation: "Independent", expertise: "X", applicationReason: "r", approvalStatus: "approved", approvedAt: new Date() },
      { accountId: affiliated!.id, affiliation: "Dp Org", expertise: "X", applicationReason: "r", approvalStatus: "approved", approvedAt: new Date() },
      { accountId: pending!.id, affiliation: "Independent", expertise: "X", applicationReason: "r", approvalStatus: "pending" },
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
      payload: { publisherId, category: "science", headline: "Disputed", summary: "s", content: "c", authorName: "a", submit: true },
    });
    expect(res.statusCode).toBe(201);
    return { articleId: res.json().article.id as string, versionId: res.json().version.id as string };
  }

  async function createDraft() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { publisherId, category: "science", headline: "Draft", summary: "s", content: "c", authorName: "a", submit: false },
    });
    return res.json().version.id as string;
  }

  async function fileDispute(versionId: string, token = filerToken, reason = "The figures don't match the cited source.") {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/disputes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason },
    });
    return res;
  }

  function respond(disputeId: string, token: string, body: Record<string, unknown>) {
    return ctx.app.inject({
      method: "POST",
      url: `/disputes/${disputeId}/respond`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  function resolve(disputeId: string, token: string, body: Record<string, unknown>) {
    return ctx.app.inject({
      method: "POST",
      url: `/disputes/${disputeId}/resolve`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  describe("GET /versions/:versionId/disputes", () => {
    it("404s for an unknown version", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/versions/00000000-0000-0000-0000-000000000000/disputes" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("404s for a draft version", async () => {
      const versionId = await createDraft();
      const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/disputes` });
      expect(res.statusCode).toBe(404);
    });

    it("returns an empty page for a published version with no disputes", async () => {
      const { versionId } = await publishArticle();
      const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/disputes` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [], nextCursor: null });
    });

    it("walks every dispute across cursor pages without overlap", async () => {
      const { versionId } = await publishArticle();
      for (const reason of ["r-one", "r-two", "r-three"]) {
        const r = await fileDispute(versionId, filerToken, reason);
        expect(r.statusCode).toBe(201);
      }
      const page1 = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/disputes?limit=2` });
      const b1 = page1.json();
      expect(b1.items).toHaveLength(2);
      expect(b1.nextCursor).toBeTypeOf("string");

      const page2 = await ctx.app.inject({
        method: "GET",
        url: `/versions/${versionId}/disputes?limit=2&cursor=${encodeURIComponent(b1.nextCursor)}`,
      });
      const b2 = page2.json();
      expect(b2.items).toHaveLength(1);
      expect(b2.nextCursor).toBeNull();

      const reasons = [...b1.items, ...b2.items].map((d: { reason: string }) => d.reason);
      expect(new Set(reasons)).toEqual(new Set(["r-one", "r-two", "r-three"]));
      for (const d of [...b1.items, ...b2.items]) expect(d.status).toBe("open");
    });
  });

  describe("POST /versions/:versionId/disputes", () => {
    it("401s without an Authorization header", async () => {
      const { versionId } = await publishArticle();
      const res = await ctx.app.inject({
        method: "POST",
        url: `/versions/${versionId}/disputes`,
        payload: { reason: "x" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("403s when the actor is not a reviewer", async () => {
      const { versionId } = await publishArticle();
      const res = await fileDispute(versionId, plainToken);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("403s for a pending (unapproved) reviewer", async () => {
      const { versionId } = await publishArticle();
      expect((await fileDispute(versionId, pendingReviewerToken)).statusCode).toBe(403);
    });

    it("403s for a reviewer structurally affiliated with the publisher (conflict of interest)", async () => {
      const { versionId } = await publishArticle();
      expect((await fileDispute(versionId, affiliatedReviewerToken)).statusCode).toBe(403);
    });

    it("404s for an unknown version", async () => {
      expect((await fileDispute("00000000-0000-0000-0000-000000000000")).statusCode).toBe(404);
    });

    it("404s for a draft version", async () => {
      const versionId = await createDraft();
      expect((await fileDispute(versionId)).statusCode).toBe(404);
    });

    it("400s on a missing reason", async () => {
      const { versionId } = await publishArticle();
      const res = await ctx.app.inject({
        method: "POST",
        url: `/versions/${versionId}/disputes`,
        headers: { authorization: `Bearer ${filerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("201s for an approved, non-affiliated reviewer — status open, no events, public identity only", async () => {
      const { versionId } = await publishArticle();
      const res = await fileDispute(versionId, filerToken, "Claim 3 is unsupported.");
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        articleVersionId: versionId,
        reason: "Claim 3 is unsupported.",
        status: "open",
        events: [],
        filedBy: { displayName: "Dr. Quill", title: "Fact Checker" },
      });
      expect(body.filedBy).not.toHaveProperty("fullName");
    });
  });

  describe("GET /disputes/:disputeId", () => {
    it("404s for an unknown dispute", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/disputes/00000000-0000-0000-0000-000000000000" });
      expect(res.statusCode).toBe(404);
    });

    it("returns the dispute with its full event history", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      await respond(disputeId, ownerToken, { note: "We are reviewing this." });

      const res = await ctx.app.inject({ method: "GET", url: `/disputes/${disputeId}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(disputeId);
      expect(body.status).toBe("publisher_responded");
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toMatchObject({ eventType: "publisher_responded", note: "We are reviewing this." });
    });
  });

  describe("POST /disputes/:disputeId/respond", () => {
    it("401s without an Authorization header", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await ctx.app.inject({ method: "POST", url: `/disputes/${disputeId}/respond`, payload: { note: "x" } });
      expect(res.statusCode).toBe(401);
    });

    it("403s when the responder is not a member of the disputed publisher", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      expect((await respond(disputeId, filerToken, { note: "not mine to answer" })).statusCode).toBe(403);
      expect((await respond(disputeId, plainToken, { note: "nope" })).statusCode).toBe(403);
    });

    it("404s for an unknown dispute", async () => {
      const res = await respond("00000000-0000-0000-0000-000000000000", ownerToken, { note: "x" });
      expect(res.statusCode).toBe(404);
    });

    it("400s when neither a note nor a correction is given", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await respond(disputeId, ownerToken, {});
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("400s when correctionVersionId is a draft, or a version of a different article", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;

      const draftId = await createDraft();
      const draftRes = await respond(disputeId, ownerToken, { correctionVersionId: draftId });
      expect(draftRes.statusCode).toBe(400);
      expect(draftRes.json().details?.[0]?.field).toBe("correctionVersionId");

      const otherArticle = await publishArticle();
      const otherRes = await respond(disputeId, ownerToken, { correctionVersionId: otherArticle.versionId });
      expect(otherRes.statusCode).toBe(400);
    });

    it("201s when a member responds with a note, moving status to publisher_responded", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await respond(disputeId, ownerToken, { note: "Figures corrected in v1.1." });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe("publisher_responded");
      expect(body.events.at(-1)).toMatchObject({ eventType: "publisher_responded", note: "Figures corrected in v1.1." });
    });

    it("201s for a second response carrying a published correction version of the same article", async () => {
      const { articleId, versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      await respond(disputeId, ownerToken, { note: "Looking into it." });

      // A published correction: a new minor version of the same article.
      const correction = await ctx.app.inject({
        method: "POST",
        url: `/articles/${articleId}/versions`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          headline: "Disputed",
          summary: "s",
          content: "c corrected",
          authorName: "a",
          changeType: "minor_correction",
          changeSummary: "Fixed figure 2.",
          submit: true,
        },
      });
      expect(correction.statusCode).toBe(201);
      const correctionVersionId = correction.json().id as string;

      const res = await respond(disputeId, ownerToken, { correctionVersionId });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe("publisher_responded");
      expect(body.events).toHaveLength(2);
      expect(body.events.at(-1)).toMatchObject({ eventType: "publisher_responded", correctionVersionId });
    });

    it("409s once the dispute is closed", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      expect((await resolve(disputeId, filerToken, { eventType: "withdrawn" })).statusCode).toBe(201);
      const res = await respond(disputeId, ownerToken, { note: "too late" });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("POST /disputes/:disputeId/resolve", () => {
    it("401s without an Authorization header", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await ctx.app.inject({
        method: "POST",
        url: `/disputes/${disputeId}/resolve`,
        payload: { eventType: "withdrawn" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("403s when a publisher member tries to resolve or withdraw — a publisher can never close a dispute", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      expect((await resolve(disputeId, ownerToken, { eventType: "resolved_addressed_no_verdict" })).statusCode).toBe(403);
      expect((await resolve(disputeId, ownerToken, { eventType: "withdrawn" })).statusCode).toBe(403);
    });

    it("403s when a reviewer who is not the filer (and not admin) tries to resolve", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      expect((await resolve(disputeId, otherReviewerToken, { eventType: "resolved_corrected" })).statusCode).toBe(403);
    });

    it("403s when anyone other than the filer tries to withdraw — including an admin", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      expect((await resolve(disputeId, otherReviewerToken, { eventType: "withdrawn" })).statusCode).toBe(403);
      expect((await resolve(disputeId, adminToken, { eventType: "withdrawn" })).statusCode).toBe(403);
    });

    it("lets the filer withdraw their own dispute", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await resolve(disputeId, filerToken, { eventType: "withdrawn", note: "Publisher fixed it privately." });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe("withdrawn");
    });

    it("lets the filer mark their dispute resolved", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await resolve(disputeId, filerToken, { eventType: "resolved_addressed_no_verdict" });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe("resolved_addressed_no_verdict");
    });

    it("lets a site admin resolve a dispute the filer left hanging", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      const res = await resolve(disputeId, adminToken, { eventType: "resolved_corrected", note: "Correction published." });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe("resolved_corrected");
    });

    it("409s on a second resolve of an already-closed dispute", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId)).json().id as string;
      expect((await resolve(disputeId, filerToken, { eventType: "resolved_corrected" })).statusCode).toBe(201);
      const res = await resolve(disputeId, filerToken, { eventType: "withdrawn" });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("append-only invariant", () => {
    it("rejects UPDATE against disputes and dispute_events", async () => {
      const { versionId } = await publishArticle();
      const disputeId = (await fileDispute(versionId, filerToken, "immutable")).json().id as string;

      await expect(
        ctx.db.update(schema.disputes).set({ reason: "tampered" }).where(eq(schema.disputes.id, disputeId)),
      ).rejects.toThrow(/append-only/);

      await respond(disputeId, ownerToken, { note: "logged" });
      await expect(
        ctx.db.update(schema.disputeEvents).set({ note: "tampered" }).where(eq(schema.disputeEvents.disputeId, disputeId)),
      ).rejects.toThrow(/append-only/);
    });
  });
});
