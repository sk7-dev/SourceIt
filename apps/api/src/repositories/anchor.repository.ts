import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

export function createAnchorRepository(db: typeof Db) {
  return {
    // The anchor record for a version, with the batch's chain-level fields
    // (merkle root, tx hash) flattened in. `leaf_hash` on the record holds the
    // version's content hash — the leaf preimage, not the domain-separated tree
    // leaf — which is what an offline verifier feeds to verifyInclusionProof.
    // Null when the version has no anchor record (it is a draft, or does not
    // exist): the route turns that into a 404.
    async findAnchorForVersion(versionId: string) {
      const [row] = await db
        .select({
          articleVersionId: schema.anchorRecords.articleVersionId,
          status: schema.anchorRecords.status,
          contentHash: schema.anchorRecords.leafHash,
          merkleProof: schema.anchorRecords.merkleProof,
          blockHeight: schema.anchorRecords.blockHeight,
          chainConfirmations: schema.anchorRecords.chainConfirmations,
          anchoredAt: schema.anchorRecords.anchoredAt,
          merkleRoot: schema.anchorBatches.merkleRoot,
          chainTxHash: schema.anchorBatches.chainTxHash,
        })
        .from(schema.anchorRecords)
        .leftJoin(
          schema.anchorBatches,
          eq(schema.anchorRecords.anchorBatchId, schema.anchorBatches.id),
        )
        .where(eq(schema.anchorRecords.articleVersionId, versionId))
        .limit(1);
      return row ?? null;
    },
  };
}
