# SourceIt — Merkle Anchoring & Inclusion Proof Spec

**Frozen 2026-09-08 (Sprint 4).** Companion to
[`CANONICALIZATION.md`](CANONICALIZATION.md), which defines a single article
version's `contentHash`. This document defines how many such hashes are batched
into a Merkle tree, how the root is anchored, and how a skeptical third party
recomputes an inclusion proof **offline, without trusting SourceIt's database**
(build prompt, "The verification property"). Implemented in
`packages/anchoring` (`merkle.ts`, `provider.ts`). A change to any constant or
rule here changes every previously-computed root and proof — it is a new
version of the spec, not a bugfix.

## Inputs

- **Leaf preimage:** a version's `contentHash` — 64 lowercase hex characters =
  32 bytes — as produced by `CANONICALIZATION.md`. Nothing else about the
  version enters the tree.

## Hashing

All hashing is SHA-256 via Web Crypto (`crypto.subtle.digest`), so the same
code runs unmodified in a browser.

- **Leaf hash:** `SHA-256( 0x00 || contentHashBytes )`
  where `contentHashBytes` is the 32 raw bytes of the hex `contentHash`.
- **Internal node:** `SHA-256( 0x01 || leftBytes || rightBytes )`
  where `leftBytes` / `rightBytes` are the 32 raw bytes of the child hashes.

The `0x00` / `0x01` domain-separation prefixes (RFC 6962 style) make it
impossible for a leaf hash to be reinterpreted as an internal node, or vice
versa — without them a leaf could be passed off as a subtree
(second-preimage).

## Tree construction

1. Order the leaves (see **Leaf order** below) and compute each leaf hash.
   Level 0 is that ordered list of leaf hashes.
2. To build level `n+1` from level `n`: take nodes in pairs left to right —
   `(0,1), (2,3), …` — and replace each pair with its internal-node hash. If
   level `n` has an odd count, the final unpaired node is **promoted unchanged**
   to level `n+1` (it is *not* duplicated and hashed with itself).
3. Repeat until a level has exactly one node: the **Merkle root**.
4. A batch of exactly one leaf has that leaf hash as its root, and an empty
   inclusion proof. A batch of zero leaves is never created.

## Leaf order

The batch's `anchor_records`, ordered by `(created_at ASC, article_version_id
ASC)`. This is deterministic: the same set of records always produces the same
root, so a batch whose worker process crashed after submitting the root to the
chain but before recording the result recomputes the identical root on retry
(see **Worker** below). Leaf order is significant — reordering the leaves
produces a different root.

## Inclusion proof

For the leaf at index `i`, the proof is the list of sibling hashes encountered
climbing from that leaf to the root, ordered **from the leaf level upward**.
Each entry is:

```
{ "hash": "<64 lowercase hex>", "side": "left" | "right" }
```

- `"side": "left"` — the sibling is the *left* child at that level; recombine as
  `nodeHash(sibling, acc)`.
- `"side": "right"` — the sibling is the *right* child; recombine as
  `nodeHash(acc, sibling)`.

A level at which this node was promoted (had no sibling) contributes **no
entry**.

## Offline verification

Given only the published `contentHash`, the proof, and the anchored `merkleRoot`
(all three are returned by `GET /versions/{versionId}/anchor`):

```
acc = SHA-256( 0x00 || contentHashBytes )
for entry in proof:                       # leaf level upward
    if entry.side == "left":
        acc = SHA-256( 0x01 || entry.hashBytes || acc )
    else:
        acc = SHA-256( 0x01 || acc || entry.hashBytes )
assert acc == merkleRoot
```

`packages/anchoring` exports `verifyInclusionProof(contentHash, proof, root)`
doing exactly this. The verifier then checks `merkleRoot` against the chain
transaction (`chainTxHash`, `blockHeight`) independently of SourceIt.

## Anchoring (the chain)

- Only a **root** is ever submitted — one chain transaction per scheduled
  batch, never one per version.
- The chain is abstracted behind the `AnchorProvider` interface
  (`packages/anchoring/src/provider.ts`): `submit({ merkleRoot })` →
  `{ chainTxHash, blockHeight, confirmations }`, and `getReceipt(merkleRoot)`
  for polling. `submit` **must be idempotent on `merkleRoot`** — resubmitting a
  root returns the same transaction, never a second one.
- Two implementations ship (the interface, worker, and schema are identical for
  both):
  - **`createFakeAnchorProvider`** (`packages/anchoring`) — in-memory, "mines"
    every root immediately with a deterministic synthetic transaction hash. The
    default for dev / CI; used whenever `ANCHOR_RPC_URL` is unset.
  - **`createChainAnchorProvider`** (`apps/worker/src/chainAnchorProvider.ts`,
    Sprint 16) — anchors on a real EVM chain (Base Sepolia now; mainnet is a
    config change). One transaction per batch calls `anchor(bytes32 root)` on
    the **Anchor contract** (`packages/anchoring-contract/contracts/Anchor.sol`):

    ```solidity
    mapping(bytes32 => bool) public anchored;
    event Anchored(bytes32 indexed root, address indexed sender, uint256 blockNumber);
    function anchor(bytes32 root) external {
        if (anchored[root]) revert AlreadyAnchored(root);
        anchored[root] = true;
        emit Anchored(root, msg.sender, block.number);
    }
    ```

    Idempotency is met without any local state: `submit` first filters the
    `Anchored` log for the exact root (indexed topic) — if it exists, that
    transaction is returned and nothing is sent. The contract's revert-on-repeat
    closes the race between two worker instances; on that revert the provider
    re-reads the log. `getReceipt` is the same log lookup and throws for a root
    that was never anchored, exactly like the fake. Confirmations are
    `currentBlock − anchorBlock + 1`.

    The signer is a dedicated private key in the worker env
    (`ANCHOR_SIGNER_PRIVATE_KEY`), faucet-funded — end users never touch a
    wallet or gas (build prompt). Config:
    `ANCHOR_RPC_URL` / `ANCHOR_CHAIN_ID` / `ANCHOR_CONTRACT_ADDRESS` /
    `ANCHOR_SIGNER_PRIVATE_KEY` / `ANCHOR_CONTRACT_DEPLOY_BLOCK` — all four of
    the first are required together, or the process refuses to start.

Adding the chain provider is **not** a change to this spec's frozen constants —
the leaf preimage, hashing, tree, leaf order, and proof format are untouched. A
root anchored by the fake and the same root anchored on-chain are byte-identical.

## Worker

`apps/worker` runs one idempotent, crash-safe sweep on a fixed interval:

1. **Claim** up to `ANCHOR_MAX_BATCH` `anchor_records` with `status = 'pending'`
   and no batch, `FOR UPDATE SKIP LOCKED`, and attach them to a new
   `anchor_batches` row (`status = 'pending'`).
2. **Submit** each `pending` batch: build the tree from its records in leaf
   order, `provider.submit(root)`, then store `merkle_root`, `chain_tx_hash`,
   `submitted_at` and set `status = 'submitted'`.
3. **Confirm** each `submitted` batch: `provider.getReceipt(root)`; once
   `confirmations >= ANCHOR_CONFIRMATIONS` (default 1), write each record's
   `merkle_proof`, `block_height`, `chain_confirmations`, `anchored_at`, set the
   record `status = 'anchored'`, and set the batch `status = 'confirmed'`,
   `confirmed_at`.

Crash safety: every step is re-derivable from the persisted batch/record rows.
A process killed between "submit to chain" and "record the result" leaves the
batch `pending` with no root; the next sweep rebuilds the identical root and
`provider.submit` returns the same receipt. No double-anchor is possible.

### Failure

A step that throws increments `anchor_batches.attempts`, records `last_error`,
and sets `next_attempt_at = now + LEAST(2^attempts, 60) seconds` — the sweep
skips the batch until then. After `ANCHOR_MAX_ATTEMPTS` (default 5) failed
attempts the batch is set `status = 'failed'` and **its records are set
`status = 'anchor_failed'`**, which is surfaced to readers exactly like any
other anchor state — never hidden behind an optimistic badge (build prompt,
"Anchoring is asynchronous and can fail"). `anchor_failed` is terminal in
Sprint 4; an admin re-queue path is deferred to a later sprint.
