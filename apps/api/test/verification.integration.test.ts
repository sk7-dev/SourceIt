import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("GET /articles/:articleId/verification", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let unverifiedOwnerToken: string;
  let reviewerToken: string;
  let verifiedPublisherId: string;
  let unverifiedPublisherId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [owner, unvOwner, reviewer] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_vf_owner", email: "vf-owner@example.com", fullName: "Vf Owner", role: "publisher" },
        { clerkUserId: "clerk_vf_unv", email: "vf-unv@example.com", fullName: "Vf Unv", role: "publisher" },
        { clerkUserId: "clerk_vf_rev", email: "vf-rev@example.com", fullName: "Vf Rev", role: "reviewer" },
      ])
      .returning();
    ownerToken = owner!.clerkUserId;
    unverifiedOwnerToken = unvOwner!.clerkUserId;
    reviewerToken = reviewer!.clerkUserId;

    const [verified, unverified] = await ctx.db
      .insert(schema.publishers)
      .values([
        { clerkOrgId: "org_vf_v", organizationName: "Vf Verified Org", displayName: "Vf Verified", website: "https://vfv.example", description: "d", categories: ["science"], verificationStatus: "verified" },
        { clerkOrgId: "org_vf_u", organizationName: "Vf Unverified Org", displayName: "Vf Unverified", website: "https://vfu.example", description: "d", verificationStatus: "unverified" },
      ])
      .returning();
    verifiedPublisherId = verified!.id;
    unverifiedPublisherId = unverified!.id;

    await ctx.db.insert(schema.publisherMembers).values([
      { publisherId: verifiedPublisherId, accountId: owner!.id, role: "owner" },
      { publisherId: unverifiedPublisherId, accountId: unvOwner!.id, role: "owner" },
    ]);

    await ctx.db.insert(schema.reviewers).values({
      accountId: reviewer!.id,
      affiliation: "Independent",
      expertise: "X",
      applicationReason: "r",
      title: "Reviewer",
      approvalStatus: "approved",
      approvedAt: new Date(),
    });
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function publish(publisherId: string, token: string, headline = "Verifiable") {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${token}` },
      payload: { publisherId, category: "science", headline, summary: "s", content: "c", authorName: "a", submit: true },
    });
    expect(res.statusCode).toBe(201);
    return { articleId: res.json().article.id as string, versionId: res.json().version.id as string };
  }

  // The system has no "verify this version" transition yet, and the append-only
  // trigger blocks UPDATE on a non-draft row — so a `verified` version can only
  // be created directly, at insert time, in a test.
  async function insertVerifiedArticle(opts: { withCorrection?: boolean } = {}) {
    const [article] = await ctx.db
      .insert(schema.articles)
      .values({ publisherId: verifiedPublisherId, category: "science" })
      .returning();
    const [v1] = await ctx.db
      .insert(schema.articleVersions)
      .values({
        articleId: article!.id,
        versionMajor: 1,
        versionMinor: 0,
        headline: "Verified article",
        summary: "s",
        content: "c",
        authorName: "a",
        changeType: "original_published",
        reviewStatus: "verified",
        contentHash: HASH_A,
        publishedAt: new Date(),
      })
      .returning();
    await ctx.db.insert(schema.anchorRecords).values({ articleVersionId: v1!.id, leafHash: HASH_A, status: "anchored" });

    if (opts.withCorrection) {
      const [v2] = await ctx.db
        .insert(schema.articleVersions)
        .values({
          articleId: article!.id,
          versionMajor: 2,
          versionMinor: 0,
          headline: "Verified article",
          summary: "s",
          content: "c v2",
          authorName: "a",
          changeType: "major_update",
          reviewStatus: "verified",
          previousVersionId: v1!.id,
          previousHash: HASH_A,
          contentHash: HASH_B,
          publishedAt: new Date(),
        })
        .returning();
      await ctx.db.insert(schema.anchorRecords).values({ articleVersionId: v2!.id, leafHash: HASH_B, status: "anchored" });
    }
    return article!.id;
  }

  function get(articleId: string) {
    return ctx.app.inject({ method: "GET", url: `/articles/${articleId}/verification` });
  }

  it("404s an unknown article id with { trustStatus: 'notfound', queriedId }", async () => {
    const res = await get("00000000-0000-0000-0000-000000000000");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ trustStatus: "notfound", queriedId: "00000000-0000-0000-0000-000000000000" });
  });

  it("404s a non-uuid id with { trustStatus: 'notfound' } and no queriedId", async () => {
    const res = await get("not-a-uuid");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ trustStatus: "notfound" });
  });

  it("404s an archived article", async () => {
    const { articleId } = await publish(verifiedPublisherId, ownerToken);
    await ctx.app.inject({
      method: "POST",
      url: `/articles/${articleId}/archive`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const res = await get(articleId);
    expect(res.statusCode).toBe(404);
    expect(res.json().trustStatus).toBe("notfound");
  });

  it("404s an article whose only version is a draft", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { publisherId: verifiedPublisherId, category: "science", headline: "D", summary: "s", content: "c", authorName: "a", submit: false },
    });
    const res = await get(create.json().article.id);
    expect(res.statusCode).toBe(404);
  });

  it("returns authentic_under_review for a just-submitted v1.0 on a verified publisher", async () => {
    const { articleId, versionId } = await publish(verifiedPublisherId, ownerToken);
    const res = await get(articleId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trustStatus).toBe("authentic_under_review");
    expect(body.currentVersion.id).toBe(versionId);
    expect(body.versionHistory).toHaveLength(1);
    expect(body.anchorRecord.status).toBe("pending");
    expect(body.redaction).toBeNull();
    expect(body.trustSummary).toMatchObject({
      registryMember: true,
      versionMatch: true,
      publisherVerified: true,
      evidenceCount: 0,
      openDisputeCount: 0,
    });
    expect(body.publisher.credibilityScore).toBeTypeOf("number");
    expect(body.publisher.transparencyLevel).toBeGreaterThanOrEqual(1);
  });

  it("returns publisher_unverified for a published article whose publisher is not verified", async () => {
    // Only a verified publisher can submit — so publish while verified, then
    // drop the publisher's verification (a lapse / revocation).
    await ctx.db
      .update(schema.publishers)
      .set({ verificationStatus: "verified" })
      .where(eq(schema.publishers.id, unverifiedPublisherId));
    const { articleId } = await publish(unverifiedPublisherId, unverifiedOwnerToken);
    await ctx.db
      .update(schema.publishers)
      .set({ verificationStatus: "unverified" })
      .where(eq(schema.publishers.id, unverifiedPublisherId));

    const res = await get(articleId);
    expect(res.statusCode).toBe(200);
    expect(res.json().trustStatus).toBe("publisher_unverified");
    expect(res.json().trustSummary.publisherVerified).toBe(false);
  });

  it("returns authentic for a verified v1.0 with no dispute", async () => {
    const articleId = await insertVerifiedArticle();
    const res = await get(articleId);
    expect(res.statusCode).toBe(200);
    expect(res.json().trustStatus).toBe("authentic");
  });

  it("returns updated for a verified article past v1.0", async () => {
    const articleId = await insertVerifiedArticle({ withCorrection: true });
    const res = await get(articleId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trustStatus).toBe("updated");
    expect(body.versionHistory).toHaveLength(2);
    expect(body.currentVersion.versionLabel).toBe("v2.0");
  });

  it("flips to disputed while an open dispute exists, and back once it is withdrawn", async () => {
    const articleId = await insertVerifiedArticle();
    const versionId = (await get(articleId)).json().currentVersion.id as string;

    const filed = await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/disputes`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { reason: "The cited figure is wrong." },
    });
    expect(filed.statusCode).toBe(201);
    const disputeId = filed.json().id as string;

    let body = (await get(articleId)).json();
    expect(body.trustStatus).toBe("disputed");
    expect(body.trustSummary.openDisputeCount).toBe(1);

    await ctx.app.inject({
      method: "POST",
      url: `/disputes/${disputeId}/resolve`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { eventType: "withdrawn" },
    });

    body = (await get(articleId)).json();
    expect(body.trustStatus).toBe("authentic");
    expect(body.trustSummary.openDisputeCount).toBe(0);
  });

  it("includes the current version's evidence and reviews", async () => {
    // Draft with evidence, then submit, then a review.
    const create = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { publisherId: verifiedPublisherId, category: "science", headline: "WithMaterial", summary: "s", content: "c", authorName: "a", submit: false },
    });
    const articleId = create.json().article.id as string;
    const versionId = create.json().version.id as string;

    const boundary = "----vf";
    const evPayload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileType"\r\n\r\ndocument\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tag"\r\n\r\nevidence\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="filename"\r\n\r\nsource.pdf\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="source.pdf"\r\nContent-Type: application/pdf\r\n\r\nbytes\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);
    const evRes = await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/evidence`,
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: evPayload,
    });
    expect(evRes.statusCode).toBe(201);

    await ctx.app.inject({
      method: "PATCH",
      url: `/articles/${articleId}/versions/${versionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { headline: "WithMaterial", summary: "s", content: "c", authorName: "a", changeType: "original_published", submit: true },
    });

    await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/reviews`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { type: "confirmation", comment: "Checks out." },
    });

    const body = (await get(articleId)).json();
    expect(body.evidence).toHaveLength(1);
    expect(body.evidence[0].filename).toBe("source.pdf");
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].comment).toBe("Checks out.");
    expect(body.trustSummary.evidenceCount).toBe(1);
  });

  it("computes a credibility score that reflects an open dispute across the publisher's articles", async () => {
    // Fresh verified publisher so the aggregate is isolated.
    const [acct] = await ctx.db
      .insert(schema.accounts)
      .values({ clerkUserId: "clerk_vf_cred", email: "vf-cred@example.com", fullName: "Cred Owner", role: "publisher" })
      .returning();
    const [pub] = await ctx.db
      .insert(schema.publishers)
      .values({ clerkOrgId: "org_vf_cred", organizationName: "Cred Org", displayName: "Cred", website: "https://cred.example", description: "d", verificationStatus: "verified" })
      .returning();
    await ctx.db.insert(schema.publisherMembers).values({ publisherId: pub!.id, accountId: acct!.id, role: "owner" });

    const clean = await publish(pub!.id, acct!.clerkUserId, "Clean");
    const disputed = await publish(pub!.id, acct!.clerkUserId, "Disputed");
    await ctx.app.inject({
      method: "POST",
      url: `/versions/${disputed.versionId}/disputes`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { reason: "x" },
    });

    const body = (await get(clean.articleId)).json();
    // 2 articles, 0 verified, 1 open dispute, 0 corrections:
    // 60 + 40*0 - 35*0.5 + 10*0 = 42.5 -> 43
    expect(body.publisher.credibilityScore).toBe(43);
  });
});
