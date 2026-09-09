import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { anchorStatusSchema } from "./enums";

// One entry of a Merkle inclusion proof — the frozen format from
// docs/ANCHORING.md. `side` says which child the sibling is: "left" recombines
// as hash(sibling, acc), "right" as hash(acc, sibling).
export const merkleProofEntrySchema = z
  .object({
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    side: z.enum(["left", "right"]),
  })
  .openapi("MerkleProofEntry");

// docs/DOMAIN.md #13 — the verification root of truth. `status` is always one
// of pending/anchored/anchor_failed and is always present in the response, never
// omitted or implied (resolves OPEN_QUESTIONS.md #1). Once anchored, this
// response carries everything a third party needs to verify offline against the
// chain without trusting SourceIt: the leaf's `contentHash`, the `merkleProof`,
// the anchored `merkleRoot`, and where that root sits on-chain
// (`chainTxHash` / `blockHeight`). `merkleRoot` and `chainTxHash` live on the
// batch and are flattened into this response — a Sprint 1 contract gap filled
// when the endpoint was implemented in Sprint 4.
export const anchorRecordSchema = z
  .object({
    articleVersionId: uuidSchema,
    status: anchorStatusSchema,
    // The version's content hash (CANONICALIZATION.md) — the value a third
    // party feeds to verifyInclusionProof. Sprint 1 named this field `leafHash`;
    // renamed on implementation because the actual Merkle leaf is the
    // domain-separated SHA-256(0x00 || contentHash) that the verifier derives
    // internally, not this preimage.
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    merkleProof: z.array(merkleProofEntrySchema).nullable(),
    merkleRoot: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    chainTxHash: z.string().nullable(),
    blockHeight: z.number().int().nullable(),
    chainConfirmations: z.number().int().min(0),
    anchoredAt: isoDatetimeSchema.nullable(),
  })
  .openapi("AnchorRecord");
