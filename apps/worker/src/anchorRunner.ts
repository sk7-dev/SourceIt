import { buildMerkleTree, type AnchorProvider, type AnchorReceipt } from "@sourceit/anchoring";
import type { AnchorRepository, ResumableBatch } from "./repositories/anchor.repository";

export interface AnchorTickDeps {
  repo: AnchorRepository;
  provider: AnchorProvider;
  // Most pending records folded into one batch this tick.
  maxBatch: number;
  // Failed attempts on a batch before it is given up on.
  maxAttempts: number;
  // Confirmations at which a submitted root counts as anchored.
  confirmationsThreshold: number;
  now?: () => Date;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface AnchorTickSummary {
  batchesCreated: number;
  batchesSubmitted: number;
  batchesConfirmed: number;
  recordsAnchored: number;
  batchesFailed: number;
  batchesRetryScheduled: number;
}

// Exponential, capped at a minute: 2s, 4s, 8s, 16s, 32s, 60s, 60s, …
function backoffSeconds(attempt: number): number {
  return Math.min(2 ** attempt, 60);
}

// One sweep of the anchoring pipeline. Idempotent and crash-safe: every step is
// re-derivable from the persisted batch/record rows, so calling this repeatedly
// (the worker loop) or after a mid-batch crash converges without losing or
// double-anchoring a record. This is the unit the integration tests drive
// directly. See docs/ANCHORING.md.
export async function runAnchorTick(deps: AnchorTickDeps): Promise<AnchorTickSummary> {
  const { repo, provider, maxBatch, maxAttempts, confirmationsThreshold } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});

  const summary: AnchorTickSummary = {
    batchesCreated: 0,
    batchesSubmitted: 0,
    batchesConfirmed: 0,
    recordsAnchored: 0,
    batchesFailed: 0,
    batchesRetryScheduled: 0,
  };

  // 1. Claim any newly-pending records into a fresh batch.
  const claimed = await repo.claimPendingIntoBatch(maxBatch);
  if (claimed) {
    summary.batchesCreated += 1;
    log("anchor batch created", { batchId: claimed.batchId, leaves: claimed.count });
  }

  // 2. Advance every due, non-terminal batch by exactly one step.
  const due = await repo.findDueBatches(now());
  for (const batch of due) {
    try {
      if (batch.status === "pending") {
        await submitBatch(batch);
      } else {
        await confirmBatch(batch);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { gaveUp } = await repo.recordFailure(
        batch.id,
        batch.attempts,
        maxAttempts,
        backoffSeconds(batch.attempts + 1),
        message,
      );
      if (gaveUp) {
        summary.batchesFailed += 1;
        log("anchor batch failed permanently — records set anchor_failed", {
          batchId: batch.id,
          error: message,
        });
      } else {
        summary.batchesRetryScheduled += 1;
        log("anchor batch attempt failed, backing off", { batchId: batch.id, error: message });
      }
    }
  }

  return summary;

  async function submitBatch(batch: ResumableBatch): Promise<void> {
    const records = await repo.getBatchRecordsInLeafOrder(batch.id);
    const tree = await buildMerkleTree(records.map((r) => r.contentHash));
    const receipt = await provider.submit({ merkleRoot: tree.root });
    await repo.markBatchSubmitted(batch.id, {
      merkleRoot: tree.root,
      chainTxHash: receipt.chainTxHash,
    });
    summary.batchesSubmitted += 1;
    log("anchor batch submitted", { batchId: batch.id, merkleRoot: tree.root });
  }

  async function confirmBatch(batch: ResumableBatch): Promise<void> {
    if (!batch.merkleRoot) {
      throw new Error("submitted batch has no merkle root");
    }
    // Poll for confirmations. If the provider can't produce a receipt for this
    // root (e.g. the process restarted and the provider lost in-memory state),
    // fall back to submit(), which is contractually idempotent on the root and
    // returns the existing transaction — so a submitted batch is always
    // drivable to completion from the persisted root alone.
    let receipt: AnchorReceipt;
    try {
      receipt = await provider.getReceipt(batch.merkleRoot);
    } catch {
      receipt = await provider.submit({ merkleRoot: batch.merkleRoot });
    }
    if (receipt.confirmations < confirmationsThreshold) {
      log("anchor batch not yet confirmed", {
        batchId: batch.id,
        confirmations: receipt.confirmations,
      });
      return;
    }
    // Rebuild the tree from the same records in the same leaf order — the root
    // must match what was submitted, and every leaf needs its own proof.
    const records = await repo.getBatchRecordsInLeafOrder(batch.id);
    const tree = await buildMerkleTree(records.map((r) => r.contentHash));
    if (tree.root !== batch.merkleRoot) {
      throw new Error(
        `rebuilt root ${tree.root} does not match submitted root ${batch.merkleRoot}`,
      );
    }
    const proofs = records.map((record, i) => ({ recordId: record.id, proof: tree.proofFor(i) }));
    await repo.finalizeBatch(batch.id, receipt.blockHeight, receipt.confirmations, proofs);
    summary.batchesConfirmed += 1;
    summary.recordsAnchored += records.length;
    log("anchor batch confirmed", {
      batchId: batch.id,
      records: records.length,
      blockHeight: receipt.blockHeight,
    });
  }
}
