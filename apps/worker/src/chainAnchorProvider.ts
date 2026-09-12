import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anchorAbi as rawAnchorAbi } from "@sourceit/anchoring-contract";
import type { AnchorProvider, AnchorReceipt } from "@sourceit/anchoring";

const anchorAbi = rawAnchorAbi as Abi;

// ---------------------------------------------------------------------------
// The three chain operations the provider needs, behind a seam so the
// provider's own logic (idempotency, root normalisation, confirmation maths,
// error mapping) is unit-testable against a faithful in-memory chain without
// viem or a node.
// ---------------------------------------------------------------------------

export interface AnchoredLog {
  txHash: Hex;
  blockNumber: bigint;
}

// Thrown by `sendAnchor` when the contract reverts `AlreadyAnchored` — i.e.
// another worker instance anchored this exact root between our log check and
// our transaction. Not an error for `submit`; the provider re-reads the log.
export class AlreadyAnchoredError extends Error {
  constructor() {
    super("root was already anchored on-chain");
    this.name = "AlreadyAnchoredError";
  }
}

export interface ChainOps {
  // The `Anchored` event for this exact root, or null if the root has never
  // been anchored. Filters on the indexed `root` topic, so it works for a
  // provider with no local memory (after a restart).
  findAnchoredLog(root: Hex): Promise<AnchoredLog | null>;
  // Send `anchor(root)` and wait for it to be mined; returns the tx hash.
  // Throws `AlreadyAnchoredError` on the contract's `AlreadyAnchored` revert.
  sendAnchor(root: Hex): Promise<Hex>;
  currentBlockNumber(): Promise<bigint>;
}

// ---------------------------------------------------------------------------
// The provider — pure logic over ChainOps.
// ---------------------------------------------------------------------------

// A version's `contentHash` / a batch's `merkleRoot` is stored as 64 lowercase
// hex characters, no `0x` (docs/ANCHORING.md). The chain wants `bytes32`.
function toBytes32(merkleRoot: string): Hex {
  const hex = merkleRoot.startsWith("0x") ? merkleRoot.slice(2) : merkleRoot;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`merkleRoot is not 32 bytes of hex: ${merkleRoot}`);
  }
  return `0x${hex.toLowerCase()}` as Hex;
}

export function createChainAnchorProvider(ops: ChainOps): AnchorProvider {
  async function receiptFor(log: AnchoredLog): Promise<AnchorReceipt> {
    const current = await ops.currentBlockNumber();
    // A tx in the latest block counts as one confirmation.
    const confirmations = Math.max(1, Number(current - log.blockNumber) + 1);
    return {
      chainTxHash: log.txHash,
      blockHeight: Number(log.blockNumber),
      confirmations,
    };
  }

  return {
    async submit({ merkleRoot }) {
      const root = toBytes32(merkleRoot);

      // Idempotency: if this root is already on-chain, return that transaction —
      // never send a second one (AnchorProvider contract).
      const existing = await ops.findAnchoredLog(root);
      if (existing) return receiptFor(existing);

      let txHash: Hex;
      try {
        txHash = await ops.sendAnchor(root);
      } catch (err) {
        if (err instanceof AlreadyAnchoredError) {
          // Lost a race with another instance — read the winning transaction.
          const log = await ops.findAnchoredLog(root);
          if (!log) {
            throw new Error(
              `anchor(${root}) reverted AlreadyAnchored but no Anchored log was found`,
            );
          }
          return receiptFor(log);
        }
        throw err;
      }

      const log = await ops.findAnchoredLog(root);
      if (!log) {
        // The tx mined but the log query lags (some RPCs) — fall back to the tx.
        return receiptFor({ txHash, blockNumber: (await ops.currentBlockNumber()) });
      }
      return receiptFor({ ...log, txHash });
    },

    async getReceipt(merkleRoot) {
      const root = toBytes32(merkleRoot);
      const log = await ops.findAnchoredLog(root);
      if (!log) {
        throw new Error(`root was never submitted through this provider: ${merkleRoot}`);
      }
      return receiptFor(log);
    },
  };
}

// ---------------------------------------------------------------------------
// The real ChainOps, backed by viem.
// ---------------------------------------------------------------------------

export interface ViemChainOpsConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: Hex;
  signerPrivateKey: Hex;
  // Lower bound for the `Anchored` log scan; defaults to 0. Set it to the
  // contract's deploy block on mainnet so the range stays small.
  deployBlock?: bigint;
}

export function createViemChainOps(cfg: ViemChainOpsConfig): ChainOps {
  const chain = defineChain({
    id: cfg.chainId,
    name: `chain-${cfg.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const account = privateKeyToAccount(cfg.signerPrivateKey);
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  const fromBlock = cfg.deployBlock ?? 0n;

  return {
    async findAnchoredLog(root) {
      const logs = await publicClient.getContractEvents({
        address: cfg.contractAddress,
        abi: anchorAbi,
        eventName: "Anchored",
        args: { root },
        fromBlock,
        toBlock: "latest",
      });
      const first = logs[0];
      return first ? { txHash: first.transactionHash, blockNumber: first.blockNumber } : null;
    },

    async sendAnchor(root) {
      try {
        const hash = await walletClient.writeContract({
          address: cfg.contractAddress,
          abi: anchorAbi,
          functionName: "anchor",
          args: [root],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      } catch (err) {
        const reverted =
          err instanceof BaseError
            ? err.walk((e) => e instanceof ContractFunctionRevertedError)
            : null;
        if (
          reverted instanceof ContractFunctionRevertedError &&
          reverted.data?.errorName === "AlreadyAnchored"
        ) {
          throw new AlreadyAnchoredError();
        }
        throw err;
      }
    },

    async currentBlockNumber() {
      return publicClient.getBlockNumber();
    },
  };
}
