import { describe, expect, it, vi } from "vitest";
import {
  AlreadyAnchoredError,
  createChainAnchorProvider,
  type AnchoredLog,
  type ChainOps,
} from "../src/chainAnchorProvider";

const ROOT_A = "a".repeat(64);
const ROOT_B = "b".repeat(64);

// A faithful in-memory model of the Anchor contract + chain: `anchor(root)`
// reverts on a repeat and otherwise emits an `Anchored` log; block numbers
// advance. This exercises the provider's full logic — idempotency, the
// AlreadyAnchored race, root normalisation, confirmation maths — without viem
// or a node.
function fakeChain(startBlock = 100n) {
  const anchored = new Map<string, AnchoredLog>();
  let block = startBlock;
  let nextTx = 0;

  const ops: ChainOps = {
    findAnchoredLog: vi.fn(async (root: string) => anchored.get(root.toLowerCase()) ?? null),
    sendAnchor: vi.fn(async (root: string) => {
      const key = root.toLowerCase();
      if (anchored.has(key)) throw new AlreadyAnchoredError();
      block += 1n;
      const txHash = `0x${String(nextTx++).padStart(64, "0")}` as `0x${string}`;
      anchored.set(key, { txHash, blockNumber: block });
      return txHash;
    }),
    currentBlockNumber: vi.fn(async () => block),
  };
  return { ops, anchored, advance: (n: bigint) => (block += n) };
}

describe("createChainAnchorProvider", () => {
  it("anchors a fresh root and returns its receipt", async () => {
    const { ops } = fakeChain();
    const provider = createChainAnchorProvider(ops);

    const receipt = await provider.submit({ merkleRoot: ROOT_A });

    expect(ops.sendAnchor).toHaveBeenCalledTimes(1);
    expect(receipt.chainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt.blockHeight).toBe(101);
    expect(receipt.confirmations).toBe(1);
  });

  it("is idempotent on the root — a second submit never sends a transaction", async () => {
    const { ops } = fakeChain();
    const provider = createChainAnchorProvider(ops);

    const first = await provider.submit({ merkleRoot: ROOT_A });
    const second = await provider.submit({ merkleRoot: ROOT_A });

    expect(ops.sendAnchor).toHaveBeenCalledTimes(1);
    expect(second.chainTxHash).toBe(first.chainTxHash);
    expect(second.blockHeight).toBe(first.blockHeight);
  });

  it("getReceipt returns the receipt for an anchored root and throws for an unknown one", async () => {
    const { ops } = fakeChain();
    const provider = createChainAnchorProvider(ops);
    await provider.submit({ merkleRoot: ROOT_A });

    const receipt = await provider.getReceipt(ROOT_A);
    expect(receipt.blockHeight).toBe(101);

    await expect(provider.getReceipt(ROOT_B)).rejects.toThrow(/never submitted through this provider/);
  });

  it("recovers from an AlreadyAnchored revert by reading the winning log", async () => {
    const { ops } = fakeChain();
    const winning = { txHash: `0x${"f".repeat(64)}` as `0x${string}`, blockNumber: 105n };
    // Another instance anchored this root between our pre-check and our send:
    // the pre-check misses it, sendAnchor reverts AlreadyAnchored, and the
    // re-read then sees the winning transaction.
    (ops.findAnchoredLog as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(winning);
    (ops.sendAnchor as ReturnType<typeof vi.fn>).mockRejectedValue(new AlreadyAnchoredError());

    const provider = createChainAnchorProvider(ops);
    const receipt = await provider.submit({ merkleRoot: ROOT_A });

    expect(receipt.chainTxHash).toBe(winning.txHash);
    expect(receipt.blockHeight).toBe(105);
  });

  it("throws if anchor reverts AlreadyAnchored but no log can be found", async () => {
    const { ops } = fakeChain();
    (ops.findAnchoredLog as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (ops.sendAnchor as ReturnType<typeof vi.fn>).mockRejectedValue(new AlreadyAnchoredError());

    const provider = createChainAnchorProvider(ops);
    await expect(provider.submit({ merkleRoot: ROOT_A })).rejects.toThrow(
      /reverted AlreadyAnchored but no Anchored log/,
    );
  });

  it("normalises the root — accepts 0x-prefixed and mixed case, rejects non-32-byte hex", async () => {
    const { ops } = fakeChain();
    const provider = createChainAnchorProvider(ops);

    await provider.submit({ merkleRoot: `0x${ROOT_A.toUpperCase()}` });
    // Same root, bare + lowercase — must be treated as identical (idempotent).
    const again = await provider.submit({ merkleRoot: ROOT_A });
    expect(ops.sendAnchor).toHaveBeenCalledTimes(1);
    expect(again.blockHeight).toBe(101);

    await expect(provider.submit({ merkleRoot: "abc" })).rejects.toThrow(/not 32 bytes of hex/);
  });

  it("counts confirmations from the current block height", async () => {
    const { ops, advance } = fakeChain();
    const provider = createChainAnchorProvider(ops);
    await provider.submit({ merkleRoot: ROOT_A }); // mined at block 101

    advance(9n); // now at block 110
    const receipt = await provider.getReceipt(ROOT_A);
    expect(receipt.confirmations).toBe(10); // 110 - 101 + 1
  });

  it("falls back to the tx hash when the log query lags after a successful send", async () => {
    const { ops } = fakeChain();
    (ops.findAnchoredLog as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // pre-check: not anchored
      .mockResolvedValueOnce(null); // post-send: log not visible yet

    const provider = createChainAnchorProvider(ops);
    const receipt = await provider.submit({ merkleRoot: ROOT_A });

    expect(ops.sendAnchor).toHaveBeenCalledTimes(1);
    expect(receipt.chainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt.confirmations).toBe(1);
  });
});
