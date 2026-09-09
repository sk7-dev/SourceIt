# Sprint 4 — Anchoring Slice

**Dates:** 2026-09-08 → 2026-09-08  ·  **Status:** Complete with carryover

## 1. Objective

Make the product's core property real: a version's content hash is now batched
into a Merkle tree, the root is anchored through a pluggable `AnchorProvider`,
and every version carries an explicit anchor state plus — once anchored — an
inclusion proof a third party can verify offline without trusting SourceIt's
database. This meant building the Merkle/proof half of `packages/anchoring`
(only canonicalization + hashing existed), freezing its public spec
(`docs/ANCHORING.md`), adding a durable crash-safe worker (`apps/worker`,
new), implementing `GET /versions/{versionId}/anchor`, and wiring the real
anchor state into the frontend's Integrity Record so it can no longer show an
optimistic "verified" on an unanchored record.

The objective was met. Nothing in it was blocked. Four design points were put to
the user before implementation (worker as a separate app, retry-then-terminal
failure policy, in-memory fake provider only, and the frozen Merkle spec shape);
all four were confirmed and built as confirmed.

## 2. Changes from Previous Sprint

- **`packages/anchoring` is no longer just canonicalization + hashing.** It now
  also has `buildMerkleTree` / `verifyInclusionProof` / `leafHash`, the
  `AnchorProvider` interface, and `createFakeAnchorProvider`. Still zero runtime
  dependencies, still browser-safe (Web Crypto, no `node:crypto`).
- **Sprint 3 left `anchor_records` rows being created as `pending` and never
  processed.** They are now processed — `apps/worker` sweeps them into batches,
  anchors the roots, and writes back proofs. The Sprint 3 "no backend search
  endpoint" and "`GET /articles/{id}/verification` unbuilt" carryovers are
  untouched and still carried.
- **Sprint 1's `anchorRecordSchema` said `merkleProof: string[]` and named the
  leaf field `leafHash`.** Implementing against it, `merkleProof` became
  `{hash, side}[]` (the real proof shape) and the response field was renamed
  `contentHash` — the value a verifier actually hashes; the Merkle leaf itself
  is the domain-separated `SHA-256(0x00 ‖ contentHash)` the verifier derives.
  `merkleRoot` and `chainTxHash` were added to the response (they live on the
  batch) so the endpoint returns everything offline verification needs.
  Documented inline in `packages/shared/src/zod/anchoring.ts`, matching the
  Sprint 3 practice for contract gaps found during implementation.
- **`anchor_records.merkle_proof`'s Drizzle `$type` changed** from `string[]` to
  `MerkleProofEntry[]` (imported from `@sourceit/anchoring` — `@sourceit/shared`
  now depends on it, one source of truth for that type). No SQL change: the
  column was and is `jsonb`, and nothing had ever written to it.
- **Docker is still unavailable in this environment** (fourth sprint running).
  Verification again used a scratch `embedded-postgres` outside the repo, torn
  down afterward.

## 3. Key Enhancements

- Anyone, signed in or not, can call `GET /versions/{versionId}/anchor` and get
  that version's explicit anchor state (`pending` / `anchored` /
  `anchor_failed`), always present, never implied. Once `anchored` the response
  also carries the `contentHash`, the `merkleProof`, the anchored `merkleRoot`,
  and where that root sits on-chain (`chainTxHash`, `blockHeight`,
  `chainConfirmations`).
- A third party can take that response and `@sourceit/anchoring`'s
  `verifyInclusionProof(contentHash, merkleProof, merkleRoot)` — or a
  from-scratch implementation of `docs/ANCHORING.md` — and confirm the version
  is in the anchored tree, using no SourceIt database access.
- The anchoring worker turns pending records into anchored ones on a schedule:
  it claims records into a Merkle batch, submits the root once, and on
  confirmation writes each record's proof. It is safe to kill and restart at
  any point — no record is lost or anchored twice.
- A batch whose chain submission keeps failing retries with exponential backoff
  and, after `ANCHOR_MAX_ATTEMPTS` (default 5), is marked `failed` with its
  records set `anchor_failed` — surfaced to readers like any other state.
- The frontend's Integrity Record on `/verification-result/:articleId` now
  renders the real anchor state for the current version instead of a hardcoded
  "On-chain Logged / ✓ Verified". `MyArticlesTable`'s "View Blockchain Proof"
  action now makes the real call and reports the real state instead of a fake
  "Fetching…" toast.

## 4. Architecture Changes

- **New app: `apps/worker`.** Its own pnpm package, own `env.ts` (Zod-validated
  at boot, like `apps/api`), own pool. Entry `src/worker.ts` runs
  `runAnchorTick` on a `setInterval` with a re-entrancy guard and graceful
  SIGINT/SIGTERM shutdown. `src/anchorRunner.ts` holds `runAnchorTick` — one
  idempotent, crash-safe sweep, and the unit the integration tests drive
  directly. `src/repositories/anchor.repository.ts` is the only SQL. No HTTP.
  Root `dev` script now runs `apps/api` and `apps/worker` in parallel; root
  `lint` / `typecheck` / `test` include `apps/worker`.
- **New in `packages/anchoring`:** `merkle.ts` (tree + proof + offline verify,
  RFC-6962-style domain separation), `provider.ts` (`AnchorProvider` interface),
  `fakeProvider.ts` (in-memory, idempotent on root, deterministic synthetic tx
  hashes), `sha256.ts` (shared byte helpers). A real L2 provider plugs in at
  `AnchorProvider` with no worker or schema change — none is built this sprint,
  per the confirmed decision.
- **New dependency edge:** `@sourceit/shared` → `@sourceit/anchoring` (for the
  `MerkleProofEntry` type on the `merkle_proof` column). `@sourceit/anchoring`
  depends on nothing, so no cycle.
- **New in `apps/api`:** `routes/anchor.route.ts` → `services/anchor.service.ts`
  → `repositories/anchor.repository.ts`, following the Phase 3 template. The
  repository left-joins `anchor_records` to `anchor_batches` and flattens the
  batch's `merkle_root` / `chain_tx_hash` into the response.
- **New frozen spec:** `docs/ANCHORING.md`, companion to
  `docs/CANONICALIZATION.md`. Leaf = `SHA-256(0x00 ‖ contentHashBytes)`, node =
  `SHA-256(0x01 ‖ left ‖ right)`, lonely node promoted (not duplicated), proof
  entries `{hash, side}` ordered leaf→root, leaf order `(created_at,
  article_version_id)`. Changing any of it is a new spec version.

## 5. Database Changes

**`migrations/0005_anchoring_worker.sql`** — additive, reversible.

- `anchor_batches` gains four nullable/defaulted columns, all the worker's
  durable retry bookkeeping:
  - `leaf_count integer NOT NULL DEFAULT 0` — denormalised batch size for ops
    visibility.
  - `attempts integer NOT NULL DEFAULT 0` — failed submit/confirm attempts.
  - `next_attempt_at timestamptz` — backoff gate; the sweep skips the batch
    until this passes.
  - `last_error text` — last failure message (truncated to 2000 chars).
- Two indexes:
  - `anchor_records_status_idx` on `anchor_records(status)` — the worker's
    "claim pending records" scan and the reader endpoint both filter on it.
  - `anchor_batches_status_idx` on `anchor_batches(status)` — the worker's
    "advance non-terminal batches" scan.

No destructive or irreversible change. Rolling back 0005 would drop those four
columns (losing in-flight retry counters — a running worker would restart each
batch's attempt budget, harmless) and the two indexes. `merkle_proof`'s column
type is unchanged (`jsonb`); only its TypeScript `$type` narrowed.

All five prior migrations plus 0005 were applied to a real Postgres this sprint
by every integration-test run (each run migrates from empty).

## 6. New Components

**Endpoint** (of the 33 in `openapi.json`, 10 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /versions/{versionId}/anchor | public | The version's anchor state; once anchored, the full offline-verifiable proof (root, proof path, chain tx). 404 if the version is unknown or still a draft. |

Layering: `routes/anchor.route.ts` → `services/anchor.service.ts` →
`repositories/anchor.repository.ts` → Postgres.

**`packages/anchoring`** new exports: `buildMerkleTree`, `leafHash`,
`verifyInclusionProof`, `MerkleTree`, `MerkleProofEntry`, `AnchorProvider`,
`AnchorSubmission`, `AnchorReceipt`, `createFakeAnchorProvider`,
`FakeAnchorProviderOptions`, `sha256Hex`.

**`apps/worker`** modules: `env.ts`, `db.ts`, `anchorRunner.ts`
(`runAnchorTick`), `repositories/anchor.repository.ts`, `worker.ts` (the
interval loop + shutdown).

**Frontend** wired to real data (no visual/structural change): `IntegrityRecord`
gains optional `anchor` / `versionCount` / `previousHash` props (null → mock,
matching `VersionHistory`'s Sprint 3 pattern); `VerificationResult` fetches the
current version's anchor and passes it down; `MyArticlesTable`'s "View
Blockchain Proof" action calls the real endpoint.

## 7. Sprint Test Results

**Totals: 65 tests, 65 passing, 0 failing, 0 skipped.** No test was weakened to
pass. One design change (see below) was made *because* a test failed.

- **`packages/anchoring`: 33/33** (`vitest run`, no DB).
  - `test/hash.test.ts`: 13/13, unchanged from Sprint 3.
  - `test/merkle.test.ts`: 20/20 (new). Covers: empty set rejected; single leaf
    is its own root with an empty proof that verifies; determinism; **leaf order
    is significant** (reordering changes the root); every leaf of trees sized
    1,2,3,4,5,7,8,9,16,17 has a proof that verifies (exercises balanced,
    lonely-node-promotion, and deep-tree paths); out-of-range proof index
    rejected; proof rejected for content not in the tree; proof rejected with a
    tampered sibling, a flipped side, or the wrong root; **leaf/node domain
    separation** (a leaf hash ≠ bare SHA-256 of the content hash).
- **`apps/worker`: 7/7** (`test/anchorRunner.integration.test.ts`, real
  Postgres via `embedded-postgres`, `fileParallelism: false`).
  - Single pending record → anchored, empty proof verifies offline.
  - Multi-leaf batch (5) → all anchored, one batch / one tx (not one per
    asset), every proof verifies against the single root.
  - **Idempotency**: 5 extra ticks after everything is anchored change no row
    and create no second batch.
  - **Batching**: `maxBatch: 3` with 5 pending → first batch capped at 3, the
    remaining 2 picked up in a second batch, both anchor.
  - **Crash between submit and confirm**: after a tick that submits, the batch
    is `submitted` with a root and records still `pending`; a fresh provider
    instance (lost in-memory state) still drives it to `confirmed` — no
    duplicate batch.
  - **No double-anchor on submit retry**: a root pre-submitted out of band is
    not re-submitted as a second tx; the same `chainTxHash` is recorded.
  - **Gives up after `maxAttempts`**: a provider that always throws → after 5
    attempts the batch is `failed`, `attempts = 5`, `last_error` set, records
    `anchor_failed`; `submit` was called exactly 5 times; a further tick leaves
    the failed batch alone.
- **`apps/api`: 25/25** (`--no-file-parallelism`, real Postgres).
  - `test/anchor.integration.test.ts`: 4/4 (new) — 404 for an unknown version
    (`code: NOT_FOUND`), 404 for a draft version (no anchor record yet), 200
    with `status: pending` / all chain fields null the moment a version is
    submitted, and 200 with the flattened `merkleRoot` / `chainTxHash` and a
    proof that `verifyInclusionProof` accepts once the record is anchored.
  - `test/articles.integration.test.ts`: 18/18, unchanged.
  - `test/me.integration.test.ts`: 3/3, unchanged.

**Invariant coverage (build prompt Section 1):**
- *Anchoring is asynchronous and can fail; state always surfaced* — worker
  "gives up after maxAttempts" test proves `anchor_failed` is reached and
  persisted; `anchor.integration.test.ts` proves the endpoint always returns an
  explicit `status`; `IntegrityRecord` no longer hardcodes "verified".
- *Do not anchor one transaction per asset* — worker "multi-leaf batch" test
  asserts 5 records share one batch and one `chainTxHash`.
- *Reproducible offline* — `merkle.test.ts` and both integration suites verify
  proofs with `verifyInclusionProof`, which is the `docs/ANCHORING.md`
  algorithm and has no DB access.
- *Background work must be idempotent and crash-safe* — worker idempotency,
  crash-between-submit-and-confirm, and no-double-anchor tests.

**Design change forced by a failing test:** the "crash between submit and
confirm" test initially failed — a `submitted` batch wedged permanently if the
provider could not produce a receipt for its root (e.g. after a restart that
lost in-memory state). `confirmBatch` now falls back to `provider.submit()`
(contractually idempotent on the root) when `getReceipt` throws, so a submitted
batch is always drivable to completion from the persisted root alone.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across `apps/api`, `apps/worker`,
`packages/shared`, `packages/anchoring`. No `any`, no `@ts-expect-error`.
**`apps/web`**: `vite build` succeeds (2204 modules, unchanged count from
Sprint 3). It still has no `tsconfig.json` (pre-existing debt); an ad-hoc `tsc`
of the three touched files surfaces only the known environmental gaps (no
`@types/react` resolution, no `import.meta.env` typing) that predate this
sprint, none from the changes themselves.

**Not run in CI.** Unchanged carryover — nothing has been pushed since Sprint 2
added the workflow. Docker (`docker compose up`, Testcontainers) still
unavailable in this environment; `embedded-postgres` remains the substitute.

## 8. Outcome

**Done and verified against a real Postgres:** the Merkle/proof half of
`packages/anchoring` with its frozen spec; `apps/worker` as a durable,
idempotent, crash-safe anchoring runner with retry-then-terminal failure
handling; `GET /versions/{versionId}/anchor`; and the frontend Integrity Record
+ "View Blockchain Proof" wired to it. 65/65 tests green.

**Not done, deliberately:**
- **No real chain provider.** Only `createFakeAnchorProvider` exists, per the
  confirmed decision. A real L2 provider (keys in config, network flakiness in
  CI, `getReceipt` polling a real explorer) is a later concern; the interface
  and the worker are ready for it.
- **No admin re-queue for `anchor_failed`.** Terminal in Sprint 4, as
  confirmed. A version stuck `anchor_failed` needs a future endpoint to reset
  it to `pending`; there is no path today other than a manual DB update.
- **`GET /articles/{id}/verification` still unbuilt** — needs Evidence / Review
  / Dispute. The Integrity Record now shows real anchor data, but the rest of
  `/verification-result` (trust summary, evidence, credibility, reviewer notes)
  is still mock for that reason.
- **`MyArticlesTable`'s "View Blockchain Proof" is a toast, not a proof
  viewer.** It now makes the real call and reports the real state, but building
  a proof-inspection modal would be new UI structure (forbidden by the build
  prompt's "may not restructure"). "Edit Article" and "Manage Media & Evidence"
  remain stubs, unchanged.
- **The worker is not in `docker-compose.yml`.** Compose only runs Postgres
  (matches the existing setup, where `apps/api` isn't in compose either); `pnpm
  dev` now runs api + worker together.

**Known debt incurred:**
- `apps/worker` duplicates the `startTestDb` helper and the `db.ts` pool setup
  from `apps/api` (~30 lines). This mirrors the Sprint 3 decision that each app
  owns its data access; repay only if a third app needs the same, by extracting
  a tiny test-support package.
- `MerkleProofEntry` now has three touch points — the library type
  (`@sourceit/anchoring`), the DB column `$type` (imports the library type), and
  the wire Zod schema (`merkleProofEntrySchema`). The first two are one source
  of truth; the Zod schema is the separate API-contract layer, as elsewhere in
  the repo. Acceptable, noted.
- `docs/ANCHORING.md`'s leaf-order rule `(created_at, article_version_id)` is
  enforced only by the worker repository's `ORDER BY`, not by a constraint. A
  second code path building a tree in a different order would produce a
  different root; there is one such path and it is tested.

**Blocked on:** nothing.

**Next sprint should do first:** the Evidence slice (evidence bound to a
version, file/URL hashing and archival snapshots, object-storage abstraction) —
it is the first of the three inputs `GET /articles/{id}/verification` needs and
unblocks the largest remaining chunk of mock frontend. Alternatively, account
provisioning (`POST /publishers`, `POST /reviewers/apply`, local `accounts`
creation) so `RegisterForm` works for real. Either way: push to GitHub and
confirm CI actually goes green — it still never has.
