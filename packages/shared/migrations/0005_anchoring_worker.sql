-- Sprint 4 (Anchoring slice). The anchoring worker (apps/worker) needs durable,
-- crash-safe retry bookkeeping on each Merkle batch: how many times submitting
-- or confirming it has failed, when it may next be retried (exponential
-- backoff), and the last error. After ANCHOR_MAX_ATTEMPTS the batch is failed
-- and its records flip to anchor_failed. `leaf_count` is denormalised for
-- operational visibility. See docs/ANCHORING.md.

ALTER TABLE "anchor_batches"
  ADD COLUMN "leaf_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "next_attempt_at" timestamp with time zone,
  ADD COLUMN "last_error" text;

-- The worker sweeps for pending records to claim and for non-terminal batches
-- to advance on every tick; both filter on status.
CREATE INDEX "anchor_records_status_idx" ON "anchor_records" ("status");
CREATE INDEX "anchor_batches_status_idx" ON "anchor_batches" ("status");
