import type { AnchorProvider, AnchorReceipt } from "./provider";
import { sha256Hex } from "./sha256";

export interface FakeAnchorProviderOptions {
  // Confirmations reported for every submitted root (default 1 — i.e. treated
  // as mined the moment it is submitted). Set to 0 to simulate a root that is
  // submitted but not yet confirmed.
  confirmations?: number;
  // First synthetic block height handed out; each submitted root gets the next
  // one (default 1_000_000).
  startBlockHeight?: number;
}

// An in-memory AnchorProvider for local development and tests. It "mines" every
// root immediately, hands out deterministic synthetic transaction hashes and
// monotonically increasing block heights, and is idempotent on the root exactly
// as a real provider must be. It holds no persistent state — a fresh instance
// knows nothing about roots submitted to a previous one.
export function createFakeAnchorProvider(options: FakeAnchorProviderOptions = {}): AnchorProvider {
  const confirmations = options.confirmations ?? 1;
  let nextBlockHeight = options.startBlockHeight ?? 1_000_000;
  const submitted = new Map<string, AnchorReceipt>();

  return {
    async submit({ merkleRoot }) {
      const existing = submitted.get(merkleRoot);
      if (existing) return existing;
      const receipt: AnchorReceipt = {
        chainTxHash: `0x${await sha256Hex(`faketx:${merkleRoot}`)}`,
        blockHeight: nextBlockHeight,
        confirmations,
      };
      nextBlockHeight += 1;
      submitted.set(merkleRoot, receipt);
      return receipt;
    },

    async getReceipt(merkleRoot) {
      const receipt = submitted.get(merkleRoot);
      if (!receipt) {
        throw new Error(`root was never submitted through this provider: ${merkleRoot}`);
      }
      return receipt;
    },
  };
}
