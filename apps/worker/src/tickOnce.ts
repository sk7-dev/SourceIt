import { createFakeAnchorProvider } from "@sourceit/anchoring";
import { env } from "./env";
import { db, pool } from "./db";
import { createAnchorRepository } from "./repositories/anchor.repository";
import { runAnchorTick } from "./anchorRunner";
import { createChainAnchorProvider, createViemChainOps } from "./chainAnchorProvider";

// One-shot alternative to worker.ts's setInterval loop, for hosts with no
// persistent process (e.g. a scheduled GitHub Actions run instead of an
// always-on container). Runs exactly one anchor tick and exits. Safe on the
// same cadence guarantees as the loop: every tick is idempotent and
// crash-safe (see anchorRunner.ts), so calling it from a fresh process each
// time is equivalent to calling it from a long-lived one.
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
  console.log(JSON.stringify({ level: "info", component: "anchor-tick-once", msg, ...extra }));
}

const summary = await runAnchorTick({
  repo,
  provider,
  maxBatch: env.ANCHOR_MAX_BATCH,
  maxAttempts: env.ANCHOR_MAX_ATTEMPTS,
  confirmationsThreshold: env.ANCHOR_CONFIRMATIONS,
  log,
});
log("anchor tick complete", { ...summary });
await pool.end();
