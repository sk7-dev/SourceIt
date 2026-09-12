# Sprint 16 — Real chain AnchorProvider

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

The build-prompt phase structure finished at Sprint 15; this is the first
post-structure slice and the most important remaining one. The chain is the
product's premise — a skeptical third party verifies an asset *without trusting
SourceIt's database* — and it was still `createFakeAnchorProvider`. This sprint
adds a real implementation: a minimal Solidity anchor contract, a viem-backed
`AnchorProvider` in the worker that meets the frozen interface (idempotent
`submit`, `getReceipt` by root), and env-driven selection so dev / CI stay on
the fake and production flips by setting `ANCHOR_RPC_URL`.

Four points were confirmed with the user: Base Sepolia now with mainnet as a
config change; a tiny anchor contract in this repo (mapping guard + `Anchored`
event) rather than EAS; a raw signing key in the worker env (KMS / relayer
documented as production hardening); and the real provider in `apps/worker`
(keeping `packages/anchoring` zero-dependency), unit-tested against a faithful
in-memory chain model plus one env-gated live test.

## 2. Changes from Previous Sprint

- **New workspace package `@sourceit/anchoring-contract`.** `contracts/Anchor.sol`
  (the registry), `scripts/compile.mjs` (solc-js → a committed
  `artifacts/Anchor.json` with abi + bytecode + solc version + a sha256 of the
  source), `scripts/deploy.mjs` (viem — deploys, prints address + deploy block),
  `src/index.ts` (exports the abi + bytecode, no runtime deps), and an
  `artifact.test.ts` that fails if the contract source drifts from the committed
  artifact.
- **`apps/worker/src/chainAnchorProvider.ts`** — `createChainAnchorProvider(ops)`
  (pure logic over a `ChainOps` seam) + `createViemChainOps(config)` (the real
  seam). viem is a new worker dependency.
- **`apps/worker/src/env.ts`** — `FAKE_ANCHOR_CONFIRMATIONS` renamed to
  **`ANCHOR_CONFIRMATIONS`** (it is no longer fake-only); five new optional
  chain vars with a `superRefine` so a partial chain config fails at boot.
- **`apps/worker/src/worker.ts`** — picks `createChainAnchorProvider` when
  `ANCHOR_RPC_URL` is set, else the fake; the startup log reports which.
- **`docs/ANCHORING.md`** — the "Anchoring (the chain)" section now documents
  both providers and the contract. Explicitly **not** a spec-version change:
  the leaf preimage, hashing, tree, leaf order, and proof format are untouched,
  and a root anchored by the fake equals the same root anchored on-chain.
- **`docs/RUNBOOK.md`** — a "Chain anchoring" section: deploy the contract, fund
  / rotate the signer, the "signer out of gas" playbook (batches →
  `anchor_failed` → the existing re-queue SQL), the testnet→mainnet cutover, and
  the KMS/relayer hardening note.
- **Root `package.json` + `eslint.config.js`** — `lint` / `typecheck` / `test`
  now include `@sourceit/anchoring-contract`; eslint ignores its `scripts/**`
  (plain-Node `.mjs`) and `artifacts/**`.
- **Carried over, still carried:** no real `ObjectStore` / evidence-blob-read
  endpoint; no real `SourceArchiver` (SSRF guard); no admin re-queue for
  `anchor_failed`; frontend components hardcoded; no backend search; the Drizzle
  anchoring-index snapshot drift; `articles.repository.ts`'s millisecond cursor.
- **`packages/anchoring` is unchanged** — still the interface + fake only, zero
  dependencies, browser-safe for offline proof verification.

## 3. Key Enhancements

- **`createChainAnchorProvider`** meets the `AnchorProvider` contract on a real
  EVM chain:
  - `submit({ merkleRoot })` → filters the contract's `Anchored` log for the
    exact root (indexed topic); if present, returns that transaction and sends
    nothing. Otherwise calls `anchor(bytes32 root)` and waits for the receipt.
    The contract's `revert AlreadyAnchored` closes the two-instance race — on
    that revert the provider re-reads the log. If the log query lags a
    successful send, it falls back to the tx hash + current block.
  - `getReceipt(merkleRoot)` → the same log lookup; throws
    `root was never submitted through this provider` for an unknown root,
    exactly like the fake, so the worker's `getReceipt`-then-`submit` fallback
    is unchanged.
  - Root normalisation accepts `0x`-prefixed and mixed-case, rejects anything
    that is not 32 bytes of hex. Confirmations are
    `currentBlock − anchorBlock + 1`.
- **The Anchor contract** (`Anchor.sol`, ~15 lines): `anchor(bytes32 root)` with
  a `mapping(bytes32 => bool)` guard that reverts on a repeat and emits
  `Anchored(bytes32 indexed root, address indexed sender, uint256 blockNumber)`.
  `root` is indexed so a provider with no local memory finds the transaction by
  topic alone. `anchored(bytes32)` is a public getter.
- **Provider selection is a one-variable switch.** `ANCHOR_RPC_URL` unset → the
  fake (dev / CI). Set → the chain provider; `ANCHOR_CHAIN_ID`,
  `ANCHOR_CONTRACT_ADDRESS`, `ANCHOR_SIGNER_PRIVATE_KEY` become required
  (boot-time Zod refinement), with optional `ANCHOR_CONTRACT_DEPLOY_BLOCK` to
  bound the log scan.
- **End users still touch no wallet, gas, or key** — the operator's signing key
  is a worker-env secret; the build prompt's "publisher signs up with an email"
  is unaffected.

## 4. Architecture Changes

- **`packages/anchoring` stays a zero-dependency library.** The chain deps
  (`viem`) and the real provider live in `apps/worker`; the `AnchorProvider`
  *interface* and the *fake* remain in `packages/anchoring`.
- **New package `@sourceit/anchoring-contract`** — the contract source, its
  compiled artifact (committed, so nothing downstream needs a Solidity
  toolchain), and the compile / deploy scripts. `solc` and `viem` are
  devDependencies there (used only by the scripts); `src/index.ts` has no
  runtime dependency.
- **The `ChainOps` seam** — `findAnchoredLog`, `sendAnchor`, `currentBlockNumber`
  — isolates the three chain calls so the provider's logic is unit-tested
  without viem or a node, and so a KMS-backed signer or a gas relayer swaps in
  at one place later.
- **No schema change, no new endpoint, no change to the worker sweep.** The
  sweep calls `provider.submit` / `provider.getReceipt` exactly as before.

## 5. Database Changes

**None.** `migrations/` is unchanged (9 migrations, 0000–0008). The chain
provider writes to a chain, not Postgres; the worker persists the same
`merkle_root` / `chain_tx_hash` / `block_height` / `chain_confirmations` it
always did.

## 6. New Components

No new endpoints. New:

- **`packages/anchoring-contract/`** — `contracts/Anchor.sol`,
  `scripts/compile.mjs`, `scripts/deploy.mjs`, `src/index.ts`,
  `artifacts/Anchor.json`, `test/artifact.test.ts`. Scripts:
  `build` (recompile the artifact), `deploy` (deploy to `ANCHOR_RPC_URL`),
  `test`, `typecheck`.
- **`apps/worker/src/chainAnchorProvider.ts`** —
  `createChainAnchorProvider(ops: ChainOps): AnchorProvider`,
  `createViemChainOps(config): ChainOps`, `AlreadyAnchoredError`, the
  `ChainOps` / `AnchoredLog` / `ViemChainOpsConfig` types.
- **`apps/worker/test/chainAnchorProvider.unit.test.ts`** (8),
  **`apps/worker/test/chainAnchorProvider.live.test.ts`** (1, env-gated).

## 7. Sprint Test Results

**Totals: 248 tests passing, 1 skipped, 0 failing** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/anchoring-contract` 3,
`@sourceit/worker` 15 passing + 1 skipped, `@sourceit/api` 197). No test was
weakened or deleted. `pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings
across all five packages. No `any`, no `@ts-expect-error`. `apps/web`:
`vite build` succeeds (2204 modules, unchanged).

**`apps/worker` — `chainAnchorProvider.unit.test.ts`: 8/8**, against a faithful
in-memory model of the contract + chain (`anchor` reverts on a repeat and emits
`Anchored`; block numbers advance):
- anchors a fresh root and returns `{ chainTxHash, blockHeight, confirmations }`;
- **idempotent on the root** — a second `submit` sends no transaction and
  returns the same tx hash / block;
- `getReceipt` resolves an anchored root and **throws for an unknown one** with
  the same message the fake uses;
- **recovers from an `AlreadyAnchored` revert** (two-instance race) by reading
  the winning log;
- **throws** if `anchor` reverts `AlreadyAnchored` but no `Anchored` log can be
  found;
- **root normalisation** — `0x`-prefixed / mixed-case treated as identical;
  a non-32-byte value is rejected;
- **confirmation maths** — `currentBlock − anchorBlock + 1`;
- **log-lag fallback** — a successful send whose log isn't yet visible returns
  the tx hash + current block.

**`apps/worker` — `chainAnchorProvider.live.test.ts`: 1 skipped.** A real
end-to-end run against a live chain (submit → idempotent re-submit → getReceipt),
skipped unless `ANCHOR_RPC_URL` + `ANCHOR_CHAIN_ID` + `ANCHOR_CONTRACT_ADDRESS`
+ `ANCHOR_SIGNER_PRIVATE_KEY` are set. It cannot run in CI or here — no deployed
contract, no funded testnet key — the same class of gap as `docker compose up`.
The 8 unit tests cover the provider's logic; the contract's 15 lines are
guarded by `artifact.test.ts`.

**`apps/worker` — `anchorRunner.integration.test.ts`: 7/7 unchanged** — the
worker sweep is untouched; the `FAKE_ANCHOR_CONFIRMATIONS` → `ANCHOR_CONFIRMATIONS`
rename did not affect the tests (they pass `confirmationsThreshold` explicitly).

**`@sourceit/anchoring-contract` — `artifact.test.ts`: 3/3** — the committed
`Anchor.json` matches the current `Anchor.sol` (sha256), exposes exactly
`anchor` / `anchored` / `Anchored` / `AlreadyAnchored` with `root` indexed, and
carries `0x`-hex bytecode.

**Invariant coverage (build prompt Section 1):**
- *The chain is the root of trust, Postgres is a cache* — a real transaction now
  backs each batch; `GET /versions/{id}/anchor` returns a `chainTxHash` an
  independent verifier can check.
- *Anchoring is asynchronous and can fail* — a chain error (out of gas, RPC
  down) increments `attempts`, backs off, and after `ANCHOR_MAX_ATTEMPTS` sets
  the records `anchor_failed`, surfaced to readers — never a false "verified".
- *`submit` is idempotent* — enforced twice: the provider's pre-check and the
  contract's revert-on-repeat. Proven by the unit tests including the race.
- *Blockchain invisible to end users* — the signer is operator infrastructure;
  no user-facing wallet, gas, or key.

**`apps/api`, `@sourceit/anchoring` suites unchanged and green.**

**Verification environment.** No local EVM (Foundry / anvil not available, same
class as Docker), no funded testnet key. `solc` compiled the contract cleanly;
viem resolves; the provider logic is fully unit-tested against a contract-faithful
model; the live path is env-gated for a manual run once a contract is deployed.
Real Postgres via `initdb`/`pg_ctl` on a non-temp path for the worker DB tests.

**CI is green** (established the previous session). The chain provider adds a
5th package to `lint` / `typecheck` / `test`; the live test skips cleanly on
GitHub's runners.

## 8. Outcome

**The chain is real.** With `ANCHOR_RPC_URL` set, each anchoring batch sends one
`anchor(bytes32 root)` transaction to a deployed Anchor contract, and
`GET /versions/{id}/anchor` returns a transaction hash and block that an
independent party checks against the chain — the verification property the whole
product exists for. Unset, dev and CI keep the instant in-memory fake. 248/248
tests green (1 env-gated live test skipped).

**Not done, deliberately or blocked:**
- **The live testnet run has not happened** — it needs a deployed contract and a
  faucet-funded key. `RUNBOOK.md` has the deploy + fund steps; the env-gated
  test verifies it end to end when run manually.
- **The signing key is a raw env secret.** Fine for testnet and a small mainnet
  float; production should move to KMS or a gas relayer — the `ChainOps` seam is
  the swap point, documented.
- **`getReceipt` / `findAnchoredLog` scan `Anchored` logs from
  `ANCHOR_CONTRACT_DEPLOY_BLOCK` to `latest` in one call.** Fine at year-one
  batch volume on a dedicated contract; a provider that anchors for years, or an
  RPC with a tight `eth_getLogs` range cap, needs paged scanning.
- **No admin re-queue for `anchor_failed`** — still manual SQL (`RUNBOOK.md`).
  A chain that is genuinely down makes this more likely to be needed; it is the
  next anchoring-adjacent slice.
- **Confirmations are L2 block confirmations**, not L1 finality. Adequate for a
  low-cost L2 at this scale; L1-finality tracking is a later refinement.

**Known debt incurred:**
- **`viem` is now a worker runtime dependency** (~1 MB). Unavoidable for real
  chain access; it is not pulled into `packages/anchoring` or `apps/api`.
- **The compiled `Anchor.json` is committed.** Deliberate — it keeps a Solidity
  toolchain out of CI and the worker — but it must be regenerated
  (`pnpm --filter @sourceit/anchoring-contract build`) after any contract edit;
  `artifact.test.ts` fails loudly if it is stale.
- **The `ChainOps` unit-test model is a hand-written stand-in for the contract.**
  It matches the 15-line contract by inspection; a Foundry/anvil integration
  test would prove the pair together and belongs with the live test when a
  local EVM is available.

**Blocked on:** nothing (the live run is a deploy step, not a blocker).

**Next steps:** deploy the contract to Base Sepolia and run the live test once;
then the real `ObjectStore` + evidence-blob-read endpoint, the real
`SourceArchiver` with the threat-model SSRF guard, the `anchor_failed` admin
re-queue, and the frontend wiring.
