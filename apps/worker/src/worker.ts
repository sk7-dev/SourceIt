import { createFakeAnchorProvider } from "@sourceit/anchoring";
import { env } from "./env";
import { db, pool } from "./db";
import { createAnchorRepository } from "./repositories/anchor.repository";
import { runAnchorTick } from "./anchorRunner";
import { createChainAnchorProvider, createViemChainOps } from "./chainAnchorProvider";

// The durable anchoring job runner (build prompt, "Background work"). The
// batch/record rows are the queue; every tick is idempotent and crash-safe, so
// this process can be killed and restarted at any point without losing or
// double-anchoring a record.
//
// With ANCHOR_RPC_URL set, the real chain provider anchors each batch's Merkle
// root by calling the Anchor contract (docs/ANCHORING.md); unset, the in-memory
// fake provider "mines" every root immediately (dev / CI). The `AnchorProvider`
// contract — idempotent `submit`, `getReceipt` by root — is identical either way,
// so the sweep below is unchanged.
const usingChain = env.ANCHOR_RPC_URL !== undefined;
const provider = usingChain
  ? createChainAnchorProvider(
      createViemChainOps({
        rpcUrl: env.ANCHOR_RPC_URL!,
        chainId: env.ANCHOR_CHAIN_ID!,
        contractAddress: env.ANCHOR_CONTRACT_ADDRESS! as `0x${string}`,
        signerPrivateKey: env.ANCHOR_SIGNER_PRIVATE_KEY! as `0x${string}`,
        deployBlock: env.ANCHOR_CONTRACT_DEPLOY_BLOCK,
      }),
    )
  : createFakeAnchorProvider({ confirmations: env.ANCHOR_CONFIRMATIONS });
const repo = createAnchorRepository(db);

function log(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", component: "anchor-worker", msg, ...extra }));
}

let running = false;
let stopped = false;

async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    const summary = await runAnchorTick({
      repo,
      provider,
      maxBatch: env.ANCHOR_MAX_BATCH,
      maxAttempts: env.ANCHOR_MAX_ATTEMPTS,
      confirmationsThreshold: env.ANCHOR_CONFIRMATIONS,
      log,
    });
    if (
      summary.batchesCreated ||
      summary.batchesSubmitted ||
      summary.batchesConfirmed ||
      summary.batchesFailed
    ) {
      log("anchor tick", { ...summary });
    }
  } catch (err) {
    log("anchor tick threw", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}

const interval = setInterval(() => void tick(), env.ANCHOR_TICK_MS);
log("anchor worker started", { tickMs: env.ANCHOR_TICK_MS, provider: usingChain ? "chain" : "fake" });
void tick();

async function shutdown(signal: string): Promise<void> {
  log("anchor worker stopping", { signal });
  stopped = true;
  clearInterval(interval);
  // Let an in-flight tick finish before the pool closes.
  while (running) await new Promise((r) => setTimeout(r, 50));
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
