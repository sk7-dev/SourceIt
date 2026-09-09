import { bytesToHex, concatBytes, hexToBytes } from "./sha256";

// FROZEN SPEC — see docs/ANCHORING.md. Changing any constant or rule below
// changes every previously-computed Merkle root and inclusion proof, and is a
// new version of the spec, not a bugfix.
//
// Domain-separation prefixes (RFC 6962 style): a leaf hash and an internal-node
// hash of the same bytes must never collide, or a leaf could be passed off as a
// subtree (second-preimage attack).
const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

async function digestHex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

// leafHash(contentHash) = SHA-256( 0x00 || rawBytes(contentHash) ).
// `contentHash` is a version's 64-char lowercase-hex content hash
// (packages/anchoring/src/hash.ts); its 32 raw bytes are the leaf preimage.
export async function leafHash(contentHash: string): Promise<string> {
  return digestHex(concatBytes(Uint8Array.of(LEAF_PREFIX), hexToBytes(contentHash)));
}

// nodeHash(L, R) = SHA-256( 0x01 || rawBytes(L) || rawBytes(R) ), L and R the
// hex hashes of the left and right children.
async function nodeHash(left: string, right: string): Promise<string> {
  return digestHex(concatBytes(Uint8Array.of(NODE_PREFIX), hexToBytes(left), hexToBytes(right)));
}

export interface MerkleProofEntry {
  // The sibling hash to combine with, 64-char lowercase hex.
  hash: string;
  // Which side the sibling is on: "left" means combine as nodeHash(sibling,
  // acc); "right" means nodeHash(acc, sibling).
  side: "left" | "right";
}

export interface MerkleTree {
  // The Merkle root, 64-char lowercase hex.
  root: string;
  // Leaf hashes, in the order given to buildMerkleTree.
  leaves: string[];
  // The inclusion proof for the leaf at `index`, ordered from the leaf level
  // upward. A level where this node was promoted (had no sibling) contributes
  // no entry.
  proofFor(index: number): MerkleProofEntry[];
}

// Builds the tree bottom-up. Odd node out at any level is promoted unchanged to
// the next level (not duplicated-and-hashed). A single leaf is its own root.
// Caller is responsible for a deterministic leaf order — the same batch must
// always produce the same root (see docs/ANCHORING.md, "Leaf order").
export async function buildMerkleTree(contentHashes: string[]): Promise<MerkleTree> {
  if (contentHashes.length === 0) {
    throw new Error("cannot build a Merkle tree with no leaves");
  }

  const leaves = await Promise.all(contentHashes.map((h) => leafHash(h)));

  const levels: string[][] = [leaves];
  while (levels[levels.length - 1]!.length > 1) {
    const prev = levels[levels.length - 1]!;
    const pending: Array<Promise<string> | string> = [];
    for (let i = 0; i < prev.length; i += 2) {
      pending.push(i + 1 < prev.length ? nodeHash(prev[i]!, prev[i + 1]!) : prev[i]!);
    }
    levels.push(await Promise.all(pending));
  }

  return {
    root: levels[levels.length - 1]![0]!,
    leaves,
    proofFor(index: number): MerkleProofEntry[] {
      if (index < 0 || index >= leaves.length || !Number.isInteger(index)) {
        throw new Error(`leaf index ${index} out of range (0..${leaves.length - 1})`);
      }
      const proof: MerkleProofEntry[] = [];
      let idx = index;
      for (let level = 0; level < levels.length - 1; level += 1) {
        const nodes = levels[level]!;
        const isRightChild = idx % 2 === 1;
        const siblingIdx = isRightChild ? idx - 1 : idx + 1;
        if (siblingIdx < nodes.length) {
          proof.push({ hash: nodes[siblingIdx]!, side: isRightChild ? "left" : "right" });
        }
        idx = Math.floor(idx / 2);
      }
      return proof;
    },
  };
}

// The offline verification a skeptical third party runs: recompute the leaf
// hash from the published content hash, fold the proof into it, and check it
// equals the anchored root. No SourceIt database access required.
export async function verifyInclusionProof(
  contentHash: string,
  proof: MerkleProofEntry[],
  root: string,
): Promise<boolean> {
  let acc = await leafHash(contentHash);
  for (const entry of proof) {
    acc = entry.side === "left" ? await nodeHash(entry.hash, acc) : await nodeHash(acc, entry.hash);
  }
  return acc === root;
}
