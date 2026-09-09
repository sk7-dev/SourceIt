import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { leafHash, verifyInclusionProof } from "@sourceit/anchoring";
import { startTestApp } from "./testApp";

describe("GET /versions/:versionId/anchor", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let publisherId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [owner] = await ctx.db
      .insert(schema.accounts)
      .values({
        clerkUserId: "clerk_anchor_owner",
        email: "anchor-owner@example.com",
        fullName: "Anchor Owner",
        role: "publisher",
      })
      .returning();
    ownerToken = owner!.clerkUserId;

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_anchor",
        organizationName: "Anchor Org",
        displayName: "Anchor Publisher",
        website: "https://anchor.example",
        description: "d",
        verificationStatus: "verified",
      })
      .returning();
    publisherId = publisher!.id;

    await ctx.db
      .insert(schema.publisherMembers)
      .values({ publisherId, accountId: owner!.id, role: "owner" });
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
        category: "technology",
        headline: "Anchored Headline",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: true,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().version as { id: string; contentHash: string };
  }

  it("404s for an unknown version id", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/versions/00000000-0000-0000-0000-000000000000/anchor",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("404s for a draft version (no anchor record until it is submitted)", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        publisherId,
        category: "technology",
        headline: "Draft",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: false,
      },
    });
    const draftVersionId = create.json().version.id as string;

    const res = await ctx.app.inject({ method: "GET", url: `/versions/${draftVersionId}/anchor` });
    expect(res.statusCode).toBe(404);
  });

  it("200s with a pending anchor state the moment a version is submitted", async () => {
    const version = await publishArticle();

    const res = await ctx.app.inject({ method: "GET", url: `/versions/${version.id}/anchor` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      articleVersionId: version.id,
      status: "pending",
      contentHash: version.contentHash,
      merkleProof: null,
      merkleRoot: null,
      chainTxHash: null,
      blockHeight: null,
      chainConfirmations: 0,
      anchoredAt: null,
    });
  });

  it("200s with the flattened root/tx and a verifiable proof once anchored", async () => {
    const version = await publishArticle();

    // Simulate the worker having anchored this version's batch.
    const merkleRoot = await leafHash(version.contentHash); // single-leaf batch → root is the leaf hash
    const [batch] = await ctx.db
      .insert(schema.anchorBatches)
      .values({
        status: "confirmed",
        merkleRoot,
        chainTxHash: "0xdeadbeef",
        leafCount: 1,
        submittedAt: new Date(),
        confirmedAt: new Date(),
      })
      .returning();
    await ctx.db
      .update(schema.anchorRecords)
      .set({
        anchorBatchId: batch!.id,
        status: "anchored",
        merkleProof: [],
        blockHeight: 1_000_000,
        chainConfirmations: 1,
        anchoredAt: new Date(),
      })
      .where(eq(schema.anchorRecords.articleVersionId, version.id));

    const res = await ctx.app.inject({ method: "GET", url: `/versions/${version.id}/anchor` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("anchored");
    expect(body.merkleRoot).toBe(merkleRoot);
    expect(body.chainTxHash).toBe("0xdeadbeef");
    expect(body.blockHeight).toBe(1_000_000);
    expect(await verifyInclusionProof(body.contentHash, body.merkleProof, body.merkleRoot)).toBe(true);
  });
});
