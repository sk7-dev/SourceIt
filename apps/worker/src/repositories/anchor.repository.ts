import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { MerkleProofEntry } from "@sourceit/anchoring";
import type { Db } from "../db";

// The leaf preimage for one record, in the canonical leaf order
// (docs/ANCHORING.md): (created_at ASC, article_version_id ASC).
export interface BatchRecord {
  id: string;
  articleVersionId: string;
  contentHash: string;
}

export interface ResumableBatch {
  id: string;
  status: "pending" | "submitted";
  merkleRoot: string | null;
  attempts: number;
}

export function createAnchorRepository(db: Db) {
  return {
    // Atomically claim up to `limit` unbatched pending records and attach them
    // to a fresh batch. FOR UPDATE SKIP LOCKED means two worker processes never
    // grab the same record. Returns null when there is nothing to anchor.
    async claimPendingIntoBatch(limit: number): Promise<{ batchId: string; count: number } | null> {
      return db.transaction(async (tx) => {
        const claimed = await tx
          .select({ id: schema.anchorRecords.id })
          .from(schema.anchorRecords)
          .where(
            and(
              eq(schema.anchorRecords.status, "pending"),
              isNull(schema.anchorRecords.anchorBatchId),
            ),
          )
          .orderBy(asc(schema.anchorRecords.createdAt), asc(schema.anchorRecords.articleVersionId))
          .limit(limit)
          .for("update", { skipLocked: true });

        if (claimed.length === 0) return null;

        const [batch] = await tx
          .insert(schema.anchorBatches)
          .values({ status: "pending", leafCount: claimed.length })
          .returning({ id: schema.anchorBatches.id });

        await tx
          .update(schema.anchorRecords)
          .set({ anchorBatchId: batch!.id })
          .where(inArray(schema.anchorRecords.id, claimed.map((r) => r.id)));

        return { batchId: batch!.id, count: claimed.length };
      });
    },

    // Batches the sweep should act on: not yet terminal, and past their backoff
    // window if they have one.
    async findDueBatches(now: Date): Promise<ResumableBatch[]> {
      const rows = await db
        .select({
          id: schema.anchorBatches.id,
          status: schema.anchorBatches.status,
          merkleRoot: schema.anchorBatches.merkleRoot,
          attempts: schema.anchorBatches.attempts,
        })
        .from(schema.anchorBatches)
        .where(
          and(
            inArray(schema.anchorBatches.status, ["pending", "submitted"]),
            or(
              isNull(schema.anchorBatches.nextAttemptAt),
              lte(schema.anchorBatches.nextAttemptAt, now),
            ),
          ),
        )
        .orderBy(asc(schema.anchorBatches.scheduledAt));

      return rows.map((r) => ({
        id: r.id,
        status: r.status as "pending" | "submitted",
        merkleRoot: r.merkleRoot,
        attempts: r.attempts,
      }));
    },

    async getBatchRecordsInLeafOrder(batchId: string): Promise<BatchRecord[]> {
      const rows = await db
        .select({
          id: schema.anchorRecords.id,
          articleVersionId: schema.anchorRecords.articleVersionId,
          contentHash: schema.anchorRecords.leafHash,
        })
        .from(schema.anchorRecords)
        .where(eq(schema.anchorRecords.anchorBatchId, batchId))
        .orderBy(asc(schema.anchorRecords.createdAt), asc(schema.anchorRecords.articleVersionId));
      return rows;
    },

    async markBatchSubmitted(
      batchId: string,
      fields: { merkleRoot: string; chainTxHash: string },
    ): Promise<void> {
      await db
        .update(schema.anchorBatches)
        .set({
          status: "submitted",
          merkleRoot: fields.merkleRoot,
          chainTxHash: fields.chainTxHash,
          submittedAt: new Date(),
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
        })
        .where(eq(schema.anchorBatches.id, batchId));
    },

    // Finalise a confirmed batch: write every record's inclusion proof and flip
    // it to anchored, then confirm the batch. One transaction — a reader never
    // sees a half-anchored batch.
    async finalizeBatch(
      batchId: string,
      blockHeight: number,
      confirmations: number,
      proofs: Array<{ recordId: string; proof: MerkleProofEntry[] }>,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        for (const { recordId, proof } of proofs) {
          await tx
            .update(schema.anchorRecords)
            .set({
              status: "anchored",
              merkleProof: proof,
              blockHeight,
              chainConfirmations: confirmations,
              anchoredAt: new Date(),
            })
            .where(eq(schema.anchorRecords.id, recordId));
        }
        await tx
          .update(schema.anchorBatches)
          .set({
            status: "confirmed",
            confirmedAt: new Date(),
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          })
          .where(eq(schema.anchorBatches.id, batchId));
      });
    },

    // Record a failed attempt. Past the attempt budget the batch is failed and
    // its still-pending records flip to anchor_failed (terminal in Sprint 4);
    // otherwise schedule a backoff retry.
    async recordFailure(
      batchId: string,
      currentAttempts: number,
      maxAttempts: number,
      backoffSeconds: number,
      error: string,
    ): Promise<{ gaveUp: boolean }> {
      const attempts = currentAttempts + 1;
      const truncatedError = error.slice(0, 2_000);

      if (attempts >= maxAttempts) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.anchorBatches)
            .set({ status: "failed", attempts, lastError: truncatedError })
            .where(eq(schema.anchorBatches.id, batchId));
          await tx
            .update(schema.anchorRecords)
            .set({ status: "anchor_failed" })
            .where(
              and(
                eq(schema.anchorRecords.anchorBatchId, batchId),
                eq(schema.anchorRecords.status, "pending"),
              ),
            );
        });
        return { gaveUp: true };
      }

      await db
        .update(schema.anchorBatches)
        .set({
          attempts,
          lastError: truncatedError,
          nextAttemptAt: sql`now() + make_interval(secs => ${backoffSeconds})`,
        })
        .where(eq(schema.anchorBatches.id, batchId));
      return { gaveUp: false };
    },
  };
}

export type AnchorRepository = ReturnType<typeof createAnchorRepository>;
