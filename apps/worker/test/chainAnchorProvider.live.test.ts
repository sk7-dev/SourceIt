import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createChainAnchorProvider, createViemChainOps } from "../src/chainAnchorProvider";

// A real end-to-end test against a live EVM chain. Skipped unless the chain env
// is set (same pattern as TEST_DATABASE_URL for the DB integration tests) — it
// needs a deployed Anchor contract and a funded signer, which CI does not have.
// To run it:
//
//   ANCHOR_RPC_URL=https://sepolia.base.org \
//   ANCHOR_CHAIN_ID=84532 \
//   ANCHOR_CONTRACT_ADDRESS=0x... \
//   ANCHOR_SIGNER_PRIVATE_KEY=0x... \
//   pnpm --filter @sourceit/worker exec vitest run chainAnchorProvider.live
const configured =
  !!process.env.ANCHOR_RPC_URL &&
  !!process.env.ANCHOR_CHAIN_ID &&
  !!process.env.ANCHOR_CONTRACT_ADDRESS &&
  !!process.env.ANCHOR_SIGNER_PRIVATE_KEY;

describe("chain AnchorProvider (live)", () => {
  it.skipIf(!configured)(
    "anchors a fresh root, is idempotent, and resolves getReceipt",
    async () => {
      const provider = createChainAnchorProvider(
        createViemChainOps({
          rpcUrl: process.env.ANCHOR_RPC_URL!,
          chainId: Number(process.env.ANCHOR_CHAIN_ID),
          contractAddress: process.env.ANCHOR_CONTRACT_ADDRESS! as `0x${string}`,
          signerPrivateKey: process.env.ANCHOR_SIGNER_PRIVATE_KEY! as `0x${string}`,
          deployBlock: process.env.ANCHOR_CONTRACT_DEPLOY_BLOCK
            ? BigInt(process.env.ANCHOR_CONTRACT_DEPLOY_BLOCK)
            : undefined,
        }),
      );

      const root = randomBytes(32).toString("hex");

      const first = await provider.submit({ merkleRoot: root });
      expect(first.chainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(first.blockHeight).toBeGreaterThan(0);
      expect(first.confirmations).toBeGreaterThanOrEqual(1);

      const again = await provider.submit({ merkleRoot: root });
      expect(again.chainTxHash).toBe(first.chainTxHash);

      const receipt = await provider.getReceipt(root);
      expect(receipt.chainTxHash).toBe(first.chainTxHash);
      expect(receipt.blockHeight).toBe(first.blockHeight);
    },
    120_000,
  );
});
