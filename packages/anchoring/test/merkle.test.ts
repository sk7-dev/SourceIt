import { describe, expect, it } from "vitest";
import {
  buildMerkleTree,
  leafHash,
  verifyInclusionProof,
  type MerkleProofEntry,
} from "../src/merkle";
import { sha256Hex } from "../src/sha256";

// 64-char lowercase-hex content hashes, the shape leaves are built from.
async function contentHash(seed: string): Promise<string> {
  return sha256Hex(`content:${seed}`);
}

async function hashes(n: number): Promise<string[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => contentHash(String(i))));
}

describe("buildMerkleTree", () => {
  it("rejects an empty leaf set", async () => {
    await expect(buildMerkleTree([])).rejects.toThrow(/no leaves/);
  });

  it("a single leaf is its own root, with an empty proof that still verifies", async () => {
    const [h] = await hashes(1);
    const tree = await buildMerkleTree([h!]);
    expect(tree.root).toBe(await leafHash(h!));
    expect(tree.proofFor(0)).toEqual([]);
    expect(await verifyInclusionProof(h!, tree.proofFor(0), tree.root)).toBe(true);
  });

  it("is deterministic: the same leaves in the same order give the same root", async () => {
    const hs = await hashes(5);
    const a = await buildMerkleTree(hs);
    const b = await buildMerkleTree([...hs]);
    expect(a.root).toBe(b.root);
  });

  it("leaf order is significant: reordering leaves changes the root", async () => {
    const hs = await hashes(4);
    const a = await buildMerkleTree(hs);
    const b = await buildMerkleTree([hs[1]!, hs[0]!, hs[2]!, hs[3]!]);
    expect(a.root).not.toBe(b.root);
  });

  // Every batch size from 1 to 17 covers the balanced case, the lonely-node
  // promotion case at multiple levels, and the deep-tree case.
  it.each([1, 2, 3, 4, 5, 7, 8, 9, 16, 17])(
    "every leaf in a %i-leaf tree has a proof that verifies against the root",
    async (n) => {
      const hs = await hashes(n);
      const tree = await buildMerkleTree(hs);
      for (let i = 0; i < n; i += 1) {
        expect(await verifyInclusionProof(hs[i]!, tree.proofFor(i), tree.root)).toBe(true);
      }
    },
  );

  it("proofFor rejects an out-of-range index", async () => {
    const tree = await buildMerkleTree(await hashes(3));
    expect(() => tree.proofFor(3)).toThrow(/out of range/);
    expect(() => tree.proofFor(-1)).toThrow(/out of range/);
  });
});

describe("verifyInclusionProof", () => {
  it("rejects a proof for content that is not in the tree", async () => {
    const hs = await hashes(6);
    const tree = await buildMerkleTree(hs);
    const notInTree = await contentHash("intruder");
    expect(await verifyInclusionProof(notInTree, tree.proofFor(0), tree.root)).toBe(false);
  });

  it("rejects a proof with a tampered sibling hash", async () => {
    const hs = await hashes(8);
    const tree = await buildMerkleTree(hs);
    const proof = tree.proofFor(3);
    const tampered: MerkleProofEntry[] = proof.map((e, i) =>
      i === 0 ? { ...e, hash: "0".repeat(64) } : e,
    );
    expect(await verifyInclusionProof(hs[3]!, tampered, tree.root)).toBe(false);
  });

  it("rejects a proof with a flipped side", async () => {
    const hs = await hashes(8);
    const tree = await buildMerkleTree(hs);
    const proof = tree.proofFor(2);
    const flipped: MerkleProofEntry[] = proof.map((e, i) =>
      i === 0 ? { ...e, side: e.side === "left" ? "right" : "left" } : e,
    );
    expect(await verifyInclusionProof(hs[2]!, flipped, tree.root)).toBe(false);
  });

  it("rejects a valid proof checked against the wrong root", async () => {
    const treeA = await buildMerkleTree(await hashes(5));
    const treeB = await buildMerkleTree(await hashes(6));
    expect(await verifyInclusionProof((await hashes(5))[0]!, treeA.proofFor(0), treeB.root)).toBe(false);
  });
});

describe("leaf/node domain separation", () => {
  it("a leaf hash is not the bare SHA-256 of the content hash (0x00 prefix is applied)", async () => {
    const h = await contentHash("x");
    expect(await leafHash(h)).not.toBe(await sha256Hex(h));
  });
});
