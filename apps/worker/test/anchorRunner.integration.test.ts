import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import {
  buildMerkleTree,
  createFakeAnchorProvider,
  sha256Hex,
  verifyInclusionProof,
  type AnchorProvider,
} from "@sourceit/anchoring";
import { startTestDb } from "./testDb";
import { createAnchorRepository } from "../src/repositories/anchor.repository";
import { runAnchorTick, type AnchorTickDeps } from "../src/anchorRunner";

// Integration test — real HTTP is not involved (this is a background worker),
// but the database is real, with real migrations applied. Run one file at a
// time against TEST_DATABASE_URL (see testDb.ts).
describe("anchoring worker", () => {
  let ctx: Awaited<ReturnType<typeof startTestDb>>;
  let repo: ReturnType<typeof createAnchorRepository>;
  let publisherId: string;

  beforeAll(async () => {
    ctx = await startTestDb();
    repo = createAnchorRepository(ctx.db);

    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({
        clerkOrgId: "org_worker_test",
        organizationName: "Worker Test Org",
        displayName: "Worker Test Publisher",
        website: "https://worker.example",
        description: "d",
        verificationStatus: "verified",
      })
      .returning();
    publisherId = publisher!.id;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    // Each test starts from a clean anchoring slate.
    await ctx.db.delete(schema.anchorRecords);
    await ctx.db.delete(schema.anchorBatches);
  });

  // Creates `n` submitted versions, each with a real content hash and a pending
  // anchor record, and returns them in leaf order.
  async function seedPendingRecords(n: number): Promise<Array<{ recordId: string; contentHash: string }>> {
    const [article] = await ctx.db
      .insert(schema.articles)
      .values({ publisherId, category: "technology" })
      .returning();

    const out: Array<{ recordId: string; contentHash: string }> = [];
    for (let i = 0; i < n; i += 1) {
      const contentHash = await sha256Hex(`worker-test-content-${article!.id}-${i}`);
      const [version] = await ctx.db
        .insert(schema.articleVersions)
        .values({
          articleId: article!.id,
          versionMajor: 1,
          versionMinor: i,
          headline: `H${i}`,
          summary: "s",
          content: "c",
          authorName: "a",
          changeType: i === 0 ? "original_published" : "minor_correction",
          changeSummary: i === 0 ? null : "fix",
          reviewStatus: "pending_review",
          contentHash,
          publishedAt: new Date(),
        })
        .returning();
      const [record] = await ctx.db
        .insert(schema.anchorRecords)
        .values({ articleVersionId: version!.id, leafHash: contentHash, status: "pending" })
        .returning();
      out.push({ recordId: record!.id, contentHash });
    }
    return out;
  }

  function deps(overrides: Partial<AnchorTickDeps> & { provider: AnchorProvider }): AnchorTickDeps {
    return {
      repo,
      maxBatch: 256,
      maxAttempts: 5,
      confirmationsThreshold: 1,
      ...overrides,
    };
  }

  // Run ticks until nothing changes or `max` is reached.
  async function drain(d: AnchorTickDeps, max = 10): Promise<number> {
    for (let i = 0; i < max; i += 1) {
      const s = await runAnchorTick(d);
      const idle =
        !s.batchesCreated && !s.batchesSubmitted && !s.batchesConfirmed && !s.batchesFailed && !s.batchesRetryScheduled;
      if (idle) return i;
    }
    return max;
  }

  async function recordStatuses(recordIds: string[]): Promise<Record<string, string>> {
    const rows = await ctx.db
      .select({ id: schema.anchorRecords.id, status: schema.anchorRecords.status })
      .from(schema.anchorRecords)
      .where(inArray(schema.anchorRecords.id, recordIds));
    return Object.fromEntries(rows.map((r) => [r.id, r.status]));
  }

  it("anchors a single pending record and produces a proof that verifies offline", async () => {
    const [seeded] = await seedPendingRecords(1);
    const provider = createFakeAnchorProvider({ confirmations: 1 });

    await drain(deps({ provider }));

    const [record] = await ctx.db
      .select()
      .from(schema.anchorRecords)
      .where(eq(schema.anchorRecords.id, seeded!.recordId));
    expect(record!.status).toBe("anchored");
    expect(record!.blockHeight).not.toBeNull();
    expect(record!.chainConfirmations).toBe(1);
    expect(record!.anchoredAt).not.toBeNull();
    expect(record!.merkleProof).toEqual([]); // single leaf → empty proof

    const [batch] = await ctx.db
      .select()
      .from(schema.anchorBatches)
      .where(eq(schema.anchorBatches.id, record!.anchorBatchId!));
    expect(batch!.status).toBe("confirmed");
    expect(batch!.merkleRoot).toMatch(/^[0-9a-f]{64}$/);

    expect(await verifyInclusionProof(seeded!.contentHash, record!.merkleProof!, batch!.merkleRoot!)).toBe(true);
  });

  it("anchors a multi-leaf batch — every record's proof verifies against the one root", async () => {
    const seeded = await seedPendingRecords(5);
    const provider = createFakeAnchorProvider({ confirmations: 1 });

    await drain(deps({ provider }));

    const rows = await ctx.db
      .select()
      .from(schema.anchorRecords)
      .where(inArray(schema.anchorRecords.id, seeded.map((s) => s.recordId)));
    expect(rows.every((r) => r.status === "anchored")).toBe(true);

    const batchIds = new Set(rows.map((r) => r.anchorBatchId));
    expect(batchIds.size).toBe(1); // one Merkle batch, one chain tx — not one per asset

    const [batch] = await ctx.db
      .select()
      .from(schema.anchorBatches)
      .where(eq(schema.anchorBatches.id, [...batchIds][0]!));

    for (const seed of seeded) {
      const row = rows.find((r) => r.id === seed.recordId)!;
      expect(await verifyInclusionProof(seed.contentHash, row.merkleProof!, batch!.merkleRoot!)).toBe(true);
    }
  });

  it("is idempotent — extra ticks after everything is anchored change nothing", async () => {
    const seeded = await seedPendingRecords(3);
    const provider = createFakeAnchorProvider({ confirmations: 1 });
    const d = deps({ provider });

    await drain(d);
    const before = await ctx.db.select().from(schema.anchorRecords);
    const batchCountBefore = (await ctx.db.select().from(schema.anchorBatches)).length;

    for (let i = 0; i < 5; i += 1) {
      const s = await runAnchorTick(d);
      expect(s).toMatchObject({ batchesCreated: 0, batchesSubmitted: 0, batchesConfirmed: 0, batchesFailed: 0 });
    }

    const after = await ctx.db.select().from(schema.anchorRecords);
    expect(after.map((r) => r.anchoredAt?.toISOString())).toEqual(before.map((r) => r.anchoredAt?.toISOString()));
    expect((await ctx.db.select().from(schema.anchorBatches)).length).toBe(batchCountBefore);
    expect(seeded.length).toBe(3);
  });

  it("batches: maxBatch caps a batch, the remainder is picked up in a later batch", async () => {
    const seeded = await seedPendingRecords(5);
    const provider = createFakeAnchorProvider({ confirmations: 1 });

    // First tick claims exactly maxBatch into one batch.
    const first = await runAnchorTick(deps({ provider, maxBatch: 3 }));
    expect(first.batchesCreated).toBe(1);

    await drain(deps({ provider, maxBatch: 3 }));

    const rows = await ctx.db
      .select()
      .from(schema.anchorRecords)
      .where(inArray(schema.anchorRecords.id, seeded.map((s) => s.recordId)));
    expect(rows.every((r) => r.status === "anchored")).toBe(true);
    expect(new Set(rows.map((r) => r.anchorBatchId)).size).toBe(2);
  });

  it("resumes a batch that was submitted to the chain but not recorded (crash between submit and confirm)", async () => {
    const seeded = await seedPendingRecords(4);
    const provider = createFakeAnchorProvider({ confirmations: 1 });

    // One tick: claim + submit. The batch is now 'submitted', records still
    // 'pending' — exactly the persisted state after a crash before confirm.
    await runAnchorTick(deps({ provider }));
    const midBatches = await ctx.db.select().from(schema.anchorBatches);
    expect(midBatches).toHaveLength(1);
    expect(midBatches[0]!.status).toBe("submitted");
    expect(Object.values(await recordStatuses(seeded.map((s) => s.recordId)))).toEqual(["pending", "pending", "pending", "pending"]);

    // Restart: a fresh provider instance that has never seen this root. The
    // worker rebuilds the identical root and re-submits; the batch converges.
    const restartedProvider = createFakeAnchorProvider({ confirmations: 1 });
    await drain(deps({ provider: restartedProvider }));

    const statuses = await recordStatuses(seeded.map((s) => s.recordId));
    expect(Object.values(statuses)).toEqual(["anchored", "anchored", "anchored", "anchored"]);
    const finalBatches = await ctx.db.select().from(schema.anchorBatches);
    expect(finalBatches).toHaveLength(1); // no duplicate batch created on resume
    expect(finalBatches[0]!.status).toBe("confirmed");
  });

  it("does not double-anchor when submit is retried against an idempotent provider", async () => {
    const seeded = await seedPendingRecords(2);
    const provider = createFakeAnchorProvider({ confirmations: 1 });

    // Claim into a batch, then compute + pre-submit its root to the provider
    // out of band — simulating a submit that reached the chain before the
    // process died.
    await repo.claimPendingIntoBatch(256);
    const [batch] = await ctx.db.select().from(schema.anchorBatches);
    const records = await repo.getBatchRecordsInLeafOrder(batch!.id);
    const tree = await buildMerkleTree(records.map((r) => r.contentHash));
    const first = await provider.submit({ merkleRoot: tree.root });

    await drain(deps({ provider }));

    const [confirmedBatch] = await ctx.db
      .select()
      .from(schema.anchorBatches)
      .where(eq(schema.anchorBatches.id, batch!.id));
    expect(confirmedBatch!.status).toBe("confirmed");
    expect(confirmedBatch!.chainTxHash).toBe(first.chainTxHash); // same tx, not a second one
    expect((await ctx.db.select().from(schema.anchorBatches)).length).toBe(1);
    expect(seeded.length).toBe(2);
  });

  it("gives up after maxAttempts: batch -> failed, records -> anchor_failed (surfaced, terminal in Sprint 4)", async () => {
    const seeded = await seedPendingRecords(2);
    let submitCalls = 0;
    const brokenProvider: AnchorProvider = {
      async submit() {
        submitCalls += 1;
        throw new Error("chain unreachable");
      },
      async getReceipt() {
        throw new Error("chain unreachable");
      },
    };

    // now() far ahead each tick so the backoff window has always elapsed.
    const d = deps({
      provider: brokenProvider,
      maxAttempts: 5,
      now: () => new Date(Date.now() + 3_600_000),
    });

    for (let i = 0; i < 6; i += 1) await runAnchorTick(d);

    const [batch] = await ctx.db.select().from(schema.anchorBatches);
    expect(batch!.status).toBe("failed");
    expect(batch!.attempts).toBe(5);
    expect(batch!.lastError).toContain("chain unreachable");
    expect(submitCalls).toBe(5);

    const statuses = await recordStatuses(seeded.map((s) => s.recordId));
    expect(Object.values(statuses)).toEqual(["anchor_failed", "anchor_failed"]);

    // A failed batch is terminal — further ticks leave it alone.
    const after = await runAnchorTick(d);
    expect(after).toMatchObject({ batchesSubmitted: 0, batchesFailed: 0 });
  });
});
