import { NotFoundError } from "../errors";
import type { createAnchorRepository } from "../repositories/anchor.repository";

type AnchorRepo = ReturnType<typeof createAnchorRepository>;

export function createAnchorService(repo: AnchorRepo) {
  return {
    // GET /versions/{versionId}/anchor — public, unauthenticated. The anchor
    // state is always one of pending/anchored/anchor_failed and is always
    // present here; a draft or unknown version has no anchor record at all and
    // is a 404 (its existence is not leaked).
    async getAnchorForVersion(versionId: string) {
      const row = await repo.findAnchorForVersion(versionId);
      if (!row) throw new NotFoundError("No anchor record for this version");
      return {
        articleVersionId: row.articleVersionId,
        status: row.status,
        contentHash: row.contentHash,
        merkleProof: row.merkleProof,
        merkleRoot: row.merkleRoot,
        chainTxHash: row.chainTxHash,
        blockHeight: row.blockHeight,
        chainConfirmations: row.chainConfirmations,
        anchoredAt: row.anchoredAt?.toISOString() ?? null,
      };
    },
  };
}
