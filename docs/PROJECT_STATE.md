# SourceIt — Project State
**Last updated:** end of Sprint 18  ·  **Current phase:** build-prompt phases done (0–5) — now on the real external integrations

> **Sprints 0–17 are committed and pushed to `origin/main`; CI on GitHub is
> green** (`pnpm install --frozen-lockfile` / `lint` / `typecheck` / `test`, the
> full Testcontainers-backed suite, on a clean `ubuntu-latest` runner).
> **Sprint 18 is awaiting commit** — the working tree holds it.

## Resume here

**The real `SourceArchiver` (SSRF-guarded) is built** (Sprint 18) — the last of
the three named fakes from the build prompt's "Third-party systems in scope"
(after the chain provider in Sprint 16 and the object store in Sprint 17).
`createGuardedSourceArchiver` (`apps/api/src/storage/sourceArchiver.ts`) is now
`apps/api`'s default `SourceArchiver` (env-unconditional — no credentials to
provision, unlike the chain RPC or the bucket): for `tag=source` evidence, it
resolves the given URL's host, rejects it if any resolved address (or a
redirect target's) is private/loopback/link-local/CGNAT/multicast/metadata —
including `169.254.169.254` and an IPv4-mapped-IPv6 literal — and only then
fetches, over a socket forced to the pre-validated address (closing the
DNS-rebinding gap between the check and the connect). Only `http:`/`https:`;
redirects are followed manually and re-validated per hop (max 5); the body is
capped at 25 MB; each hop times out at 15s. `docs/THREAT_MODEL.md`'s SSRF row
is now Closed.

- **Tests keep the deterministic fake.** `apps/api/test/testApp.ts` now passes
  `sourceArchiver: createFakeSourceArchiver()` explicitly (previously this was
  just `app.ts`'s unconfigured default) — the integration suite has no network
  access and `evidence.integration.test.ts` asserts the fake's exact
  `archived-snapshot:<url>` bytes. Same substitution reasoning as
  `verifySession` in that file.
- **New `apps/api/test/sourceArchiver.unit.test.ts` — 40/40, no DB, no
  network.** `isBlockedAddress` against 18 blocked / 7 allowed literal
  addresses (private ranges, loopback, link-local, CGNAT, multicast, the
  metadata IP, an IPv4-mapped-IPv6 loopback, and a garbage string failing
  closed); the redirect/size-cap/status orchestration against injected fake
  `resolveAddresses`/`performHop`; the real single-hop transport
  (`nodeHttpPerformHop`, exported for this) against a real local
  `http.createServer()` — byte/status/content-type passthrough, a declared
  oversized `Content-Length` rejected before the body is read, a streamed
  body over the cap aborted mid-transfer, and a timeout on a server that never
  responds.
- **Node's `net.BlockList` needed care.** Adding an `"ipv6"` rule for
  `::ffff:0:0/96` (to reject IPv4-mapped IPv6) was tried and — verified
  directly, empirically, against a running Node process — made `check(addr,
  "ipv4")` return `true` for *every* plain IPv4 address, including public
  ones, once any `"ipv6"` rule existed alongside the `"ipv4"` ones. Dropped
  that rule entirely: `BlockList` already cross-checks an IPv4-mapped IPv6
  literal against the `"ipv4"` rules when checked as `"ipv6"`, confirmed with
  the same kind of direct check, so nothing else was needed.
- **`http.request`'s custom `lookup` option is called with `options.all:
  true`** (Happy Eyeballs) and expects an array of `{ address, family }` back,
  not the single-address positional form — the first working version passed a
  bare address and failed every real request with a confusing "Invalid IP
  address: undefined"; caught by the `nodeHttpPerformHop` tests against a real
  server, not by the orchestration tests (which never reach real `http`).
- **Not run this session:** the full DB-backed `@sourceit/api` integration
  suite (would need rebuilding the embedded-postgres workaround from Sprint
  11's notes; none was running here). The change to that suite is a like-for-
  like substitution (the fake was already the default `sourceArchiver` before
  this sprint), typecheck and lint are clean across all five packages, and the
  40 new unit tests fully exercise the new module in isolation — but the
  previously-verified 208/208 `apps/api` count is not re-confirmed here.

Before Sprint 18: **evidence files are real** (Sprint 17). With `OBJECT_STORE_BUCKET` set, `apps/api`
stores evidence bytes in a real S3-compatible bucket (AWS S3, R2, B2, MinIO —
`apps/api/src/storage/s3ObjectStore.ts`, `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner`), and the new public
`GET /versions/{id}/evidence/{evidenceId}/file` mints a short-lived signed URL on
every call and `302`s to it. The bucket stays private — confirmed with the user
over the alternative (a public-read bucket with a stable baked-in URL). Unset →
the in-memory fake (dev / CI), whose `getSignedUrl` returns a deterministic,
obviously-inert `memory://unconfigured-object-store/<key>` placeholder. The
"View File" button in `EvidenceSection.tsx`, inert since it was built, now
opens the real file for real evidence rows.

- **`getSignedUrl` is fully unit-tested without a real bucket** — SigV4 signing
  is a local computation, so a real `S3Client` with dummy credentials produces
  a real, inspectable URL with no network call (`test/s3ObjectStore.unit.test.ts`,
  6 tests, also covering the idempotent-`put`-via-`HeadObject` check and `get`).
  Only the actual HTTP round-trip to a live bucket is unverified here.
- **No schema change** — `evidence.storage_key` (content-addressed, since
  Sprint 5) is reused unchanged as the object key.
- **Not built**: the real `SourceArchiver` (SSRF-guarded) is still the other
  named fake from Evidence's "third-party systems in scope"; see
  [SPRINT_17_REPORT.md](sprints/SPRINT_17_REPORT.md).

Before Sprint 17: **the chain is real** (Sprint 16). With `ANCHOR_RPC_URL` set, the worker anchors
each Merkle batch by sending one `anchor(bytes32 root)` transaction to a
deployed **Anchor contract** (`packages/anchoring-contract/contracts/Anchor.sol`
— a `mapping(bytes32=>bool)` guard + `Anchored(bytes32 indexed root, …)` event),
and `GET /versions/{id}/anchor` returns a real `chainTxHash` / `blockHeight` an
independent verifier checks against the chain. Unset → the in-memory fake
(dev / CI), unchanged.

- **`apps/worker/src/chainAnchorProvider.ts`** — `createChainAnchorProvider(ops)`
  (pure logic) + `createViemChainOps(config)` (viem seam). `submit` filters the
  `Anchored` log by the indexed root first (idempotent, no local state needed),
  else calls `anchor()` and waits; the contract's revert-on-repeat closes the
  two-instance race. `getReceipt` is the same log lookup and throws for an
  unknown root, exactly like the fake.
- **`packages/anchoring` stays zero-dependency** (interface + fake only). viem
  is a worker dep; the contract source + compiled artifact + compile/deploy
  scripts are the new `@sourceit/anchoring-contract` package (`solc` / `viem`
  are its devDeps only).
- **Env** (`apps/worker`): `FAKE_ANCHOR_CONFIRMATIONS` → `ANCHOR_CONFIRMATIONS`;
  `ANCHOR_RPC_URL` / `ANCHOR_CHAIN_ID` / `ANCHOR_CONTRACT_ADDRESS` /
  `ANCHOR_SIGNER_PRIVATE_KEY` / `ANCHOR_CONTRACT_DEPLOY_BLOCK` (the first four
  required together, boot-time refinement). Signer is a raw env key,
  faucet-funded — end users touch no wallet or gas.
- **Not run**: the live testnet path (no deployed contract, no funded key — same
  class of gap as `docker compose up`). 8 unit tests cover the provider against
  a contract-faithful in-memory model; the live e2e test is env-gated.
  `docs/RUNBOOK.md` has the deploy + fund + rotate + cutover steps.

Base Sepolia was the confirmed chain; mainnet is a config change. Not a spec
change — `docs/ANCHORING.md`'s frozen root/proof/hash constants are untouched.

Before Sprint 16: **Phase 5 (Hardening)** — Sprint 15 added per-IP rate
limiting, a clean error envelope for framework 4xx, an N+1/`EXPLAIN` audit +
`0008` indexes, and `RUNBOOK.md` / `THREAT_MODEL.md` / `PERFORMANCE.md`. Details:

- **Rate limiting** (`apps/api/src/plugins/rateLimit.ts`, `@fastify/rate-limit`):
  one global per-IP budget for reads (`RATE_LIMIT_MAX`, default 300 / minute), a
  tighter one for every mutating method (`RATE_LIMIT_WRITE_MAX`, default 30) via
  an `onRoute` hook, keyed by the first `X-Forwarded-For` hop else the socket
  address. `/healthz` + `/readyz` exempt. `429` → `{ code: "RATE_LIMITED" }`.
  Per-instance — a Redis store swap is documented for multi-instance.
- **`buildApp` is now `async`** (`await buildApp(...)`) — the rate-limit plugin
  must be `await`ed before routes register or Fastify v5 silently drops its
  global hook.
- **Error handler**: a framework `4xx` (`error.statusCode` 400–499) maps onto
  `{ code, message }` — `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`,
  `429 RATE_LIMITED` — instead of a misleading `500` (repays known debt). Every
  `500` logs `reqId` + `route` + a stable `fingerprint`.
- **`migrations/0008_hardening_indexes.sql`**: `saved_articles(account_id, id)` +
  `publisher_follows(account_id, id)` — the `GET /saved-articles` /
  `/publisher-follows` keyset queries went from a PK-scan-with-filter to a clean
  index cond (`EXPLAIN`-proven, `docs/PERFORMANCE.md`). Also in
  `schema/reader.ts` so schema and migration agree.
- **N+1 removed** from `GET /publisher-follows` (`creditAggregateForPublishers`).
- **`docs/RUNBOOK.md`** (deploy, code-vs-schema rollback, run a migration, DB at
  90% connections, worker stuck, backup + restore-drill plan),
  **`docs/THREAT_MODEL.md`** (per-endpoint-group attack → control),
  **`docs/PERFORMANCE.md`** (the N+1 audit + every `EXPLAIN ANALYZE`).

Error tracking is the hardened pino logging, **not** a new dependency. Backups +
a tested restore are **documented in the runbook, not executed** — no live
deployment. See [SPRINT_15_REPORT.md](sprints/SPRINT_15_REPORT.md).

Before Sprint 15: **publisher-dashboard reads** (Sprint 14) — 6 GET
`/publishers/{id}/*` endpoints; `activity_events` + `credibility_score_history`
written by a recorder injected into the write services. See
[SPRINT_14_REPORT.md](sprints/SPRINT_14_REPORT.md).

**TrustStatus** precedence (2026-09-09): `notfound > disputed >
publisher_unverified > authentic_under_review > updated > authentic`; anchor
state and redaction are separate tracks. All six values reachable.
**Credibility** (2026-09-09): computed at read time in
`apps/api/src/services/trust.ts`; logged to `credibility_score_history` on
score-moving events (Sprint 14); the cached `publishers.credibility_score`
column is still never written.

**Biggest current gap:** all three named external integrations are now real
code (chain, object store, source archiver) — what remains is running two of
them live: the Sprint 16 chain provider's **live testnet run** (deploy the
contract + fund a key), and exercising a real bucket end to end (no cloud
account/credentials in this environment). The build-prompt phases are done and
CI is green.

Still mock / unbuilt, deliberately or blocked, after Sprint 18:

- **No real bucket provisioned or exercised end to end** — no cloud
  account/credentials in this environment. The store's logic (signing,
  idempotent put, get, not-found) is fully unit-tested against a real
  `S3Client` with dummy credentials; only the live HTTP round-trip is unrun.
  `RUNBOOK.md` → "Object storage" has the setup + sanity-check steps.
- **Object storage credentials are a static access key** in `api`'s env, scoped
  to one bucket — a future pass could move to short-lived STS credentials.
- **The chain provider has not run against a live chain** — the contract is not
  deployed and there is no funded signer here. Unit-verified against a
  contract-faithful model; the live e2e test is env-gated; `RUNBOOK.md` →
  "Chain anchoring" has the deploy/fund/rotate steps.
- **`docker compose up` still unverified here** — no Docker in this dev
  environment. CI proves the Testcontainers path works on GitHub's runners; a
  local `docker compose up` has never been run.
- **Backups + restore are documented, not executed** (`RUNBOOK.md`) — needs a
  deployment.
- **No error-tracking vendor** — structured logs + a `fingerprint` grouping
  key; alerting is the deploy platform's job.
- **Rate limiting is per-instance** — exact cross-instance limits need the Redis
  store (documented).
- **The chain signer is a raw env key** — fine for testnet / a small mainnet
  float; production wants KMS or a gas relayer (the `ChainOps` seam is the swap
  point, documented).
- **`getReceipt` scans `Anchored` logs `deployBlock`→`latest` in one call** —
  fine at year-one volume on a dedicated contract; needs paging for a
  years-old contract or a tight-`eth_getLogs` RPC.
- **The SSRF guard blocks by IP range, not a hostname allow-list** — any public
  host is reachable (a "source" can be any public article URL) and destination
  ports aren't restricted; a public host that itself proxies to an internal
  service is outside this guard's reach. Standard for this class of defense,
  documented in `THREAT_MODEL.md`'s residual-risk list, not treated as a gap.
- **No admin re-queue for `anchor_failed`** — terminal since Sprint 4; manual
  SQL recovery in `RUNBOOK.md`.
- **The publisher-dashboard + reader frontend components are hardcoded** and not
  wired (`AnalyticsCards`, `CredibilityPanel`, `RecentActivity`,
  `PublisherProfileCard`, `ReviewsDisputes`, `SavedArticles.tsx`,
  `TrustedPublishers.tsx`, `RecentlyVerified.tsx`, `UserStats.tsx`) — the build
  prompt forbade restructuring them; revisit that constraint.
- **No real Clerk Organization** — `publishers.clerk_org_id` is a
  `local_org_<uuid>` placeholder; `publisher_members` is our own table.
- **`activity_events` covers only the `apps/api` write paths** — no `blockchain`
  event from the worker, no `redaction` event.
- **`GET /publishers/{id}/articles` is not redaction-suppressed**;
  **`changeSummary` not blanked on a redacted version**; **redaction
  irreversible**; **no un-verify**.
- **`ensureAccount` is first-writer-wins on `role`**;
  **`reviewerSchema` in the approval queue is identity-free**;
  **admin decision endpoints don't reject a no-op.**
- **No dispute frontend**; **no reviewer-facing write UI** (`ReviewerPortal.tsx`
  is a stub).
- **No backend search endpoint.**

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Discovery — domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |
| 3 | Article vertical slice: backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |
| 4 | Anchoring slice: Merkle tree + proof + AnchorProvider, durable crash-safe worker, GET /versions/{id}/anchor | Complete with carryover | [SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md) |
| 5 | Evidence slice: multipart POST + public GET, ObjectStore + SourceArchiver seams (fakes), append-only | Complete with carryover | [SPRINT_5_REPORT.md](sprints/SPRINT_5_REPORT.md) |
| 6 | Review slice: GET/POST reviews + retract, approved-reviewer gate, structural COI, append-only retraction | Complete with carryover | [SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md) |
| 7 | Dispute slice: 5 endpoints, publisher-cannot-suppress, terminal lifecycle, append-only — backend + tests only | Complete with carryover | [SPRINT_7_REPORT.md](sprints/SPRINT_7_REPORT.md) |
| 8 | Composed GET /articles/{id}/verification + read-time credibility; VerificationResult on one call | Complete with carryover | [SPRINT_8_REPORT.md](sprints/SPRINT_8_REPORT.md) |
| 9 | Admin decision queues: publisher-verification + reviewer-approval, single `admin` authz action — backend + tests only | Complete with carryover | [SPRINT_9_REPORT.md](sprints/SPRINT_9_REPORT.md) |
| 10 | Account provisioning: POST /publishers + /reviewers/apply, lazy `accounts` materialization, RegisterForm wired | Complete with carryover | [SPRINT_10_REPORT.md](sprints/SPRINT_10_REPORT.md) |
| 11 | Version-verification: POST /versions/{id}/verify, append-only `version_verifications`, `verified` derived at read time | Complete with carryover | [SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md) |
| 12 | Redaction: GET/POST /versions/{id}/redaction, admin-only, append-only tombstone (0007 trigger), read-layer suppression | Complete with carryover | [SPRINT_12_REPORT.md](sprints/SPRINT_12_REPORT.md) |
| 13 | Reader features: POST /readers + six saved-article/publisher-follow endpoints, batched read-time trustStatus | Complete with carryover | [SPRINT_13_REPORT.md](sprints/SPRINT_13_REPORT.md) |
| 14 | Publisher-dashboard reads: 6 GET /publishers/{id}/* endpoints; activity_events + credibility_score_history now written | Complete with carryover | [SPRINT_14_REPORT.md](sprints/SPRINT_14_REPORT.md) |
| 15 | Hardening (Phase 5): rate limiting, error-envelope for framework 4xx, N+1/EXPLAIN audit + 0008 indexes, RUNBOOK + THREAT_MODEL + PERFORMANCE docs | Complete with carryover | [SPRINT_15_REPORT.md](sprints/SPRINT_15_REPORT.md) |
| 16 | Real chain AnchorProvider: `@sourceit/anchoring-contract` (Anchor.sol + artifact), viem-backed `createChainAnchorProvider` in the worker, env-selected; live testnet run pending | Complete with carryover | [SPRINT_16_REPORT.md](sprints/SPRINT_16_REPORT.md) |
| 17 | Real ObjectStore: S3-compatible `s3ObjectStore.ts`, env-selected; new public `GET /versions/{id}/evidence/{evidenceId}/file` signed-URL redirect; "View File" wired | Complete with carryover | [SPRINT_17_REPORT.md](sprints/SPRINT_17_REPORT.md) |
| 18 | Real SourceArchiver: SSRF-guarded `createGuardedSourceArchiver` (DNS-resolve + IP-block-list + forced-address connect + manual redirect re-validation), now the default; fake pinned explicitly in tests | Complete with carryover | [SPRINT_18_REPORT.md](sprints/SPRINT_18_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. **19 tables** — unchanged since
Sprint 11 added `version_verifications`. Sprint 15 added `0008` (two indexes, no
table). `activity_events` and `credibility_score_history` are written by the API
as of Sprint 14.

TrustStatus, credibility (the score), and `verified` are computed at read time.
Redaction is read-layer suppression. The cached `publishers.credibility_score`
column is unwritten.

```
Account ──has role──> reader | publisher | reviewer | admin

Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership + reviewer-COI join]
Publisher (1) ──publishes──> (N) Article
Publisher (1) ──has──> (N) ActivityEvent           [written Sprint 14]
Publisher (1) ──has──> (N) CredibilityScoreHistory [written Sprint 14, deduped]

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained]
ArticleVersion (1) ──has──> (N) Evidence
ArticleVersion (1) ──has──> (1) AnchorRecord
ArticleVersion (1) ──has──> (0..1) Redaction       [append-only tombstone; admin-only;
                                                     blanks content at the read layer]
ArticleVersion (1) ──has──> (N) Review
ArticleVersion (1) ──has──> (0..1) VersionVerification  [append-only; presence = "verified"]
ArticleVersion (1) ──has──> (N) Dispute
Dispute        (1) ──has──> (N) DisputeEvent

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute | (N) VersionVerification

Account(reader) ──saves───> (N) SavedArticle ──> Article
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher

AnchorBatch (1) ──has──> (N) AnchorRecord
```

## Implemented endpoints

`packages/shared/openapi.json` — **36 paths / 45 operations; all 45 implemented**,
verified against a real database. `GET /healthz` / `GET /readyz` also exist but
are intentionally not in `openapi.json`. Full method/path/auth/sprint table: see
Sprint 14's PROJECT_STATE (unchanged since, plus Sprint 17's new file-redirect
path). Rate limiting now applies to all of them (health checks exempt; mutating
methods get the tighter budget).

## Decisions

Append-only. Load-bearing entries kept; sprint reports carry the rest.

- 2026-07-08 — Railway deploy target (Fly.io fallback). **Confirmed 2026-08-26.**
- 2026-07-08 — Clerk for auth. **Confirmed 2026-08-26.**
- 2026-08-26 — Anchor state always shows an explicit badge, never optimistic
  "verified." **Sprint 4.**
- 2026-08-26 — Dispute is a separate entity; a publisher may respond but never
  resolve/withdraw/hide. **Sprint 7.**
- 2026-08-26 — Credibility uses exactly the 3 factors the frontend shows;
  revisit as a versioned formula change.
- 2026-08-26 — Reviewer COI is structural (`publisher_members`). Shared by
  `review:create` / `dispute:file` / `version:verify`.
- 2026-08-26 — Redaction tombstones are fully public; the legal `reason` is not
  in the public schema. **Enforced Sprint 12.**
- 2026-08-26 — Publisher verification unverified → pending → verified (+
  rejected) by an `admin` account; one `admin` role, both queues.
- 2026-08-26 — Reader-facing trust status has 6 values.
- 2026-08-26 — Reviews/disputes attributed by pseudonym; `accounts.fullName`
  never exposed. Extended Sprint 11.
- 2026-08-26 — `/simple-login` and `/reader-portal` are dead. **Not yet
  deleted.**
- 2026-08-26 — Schema entity names frozen at the Sprint 1 stop point.
- 2026-08-26 — Session auth is a Clerk JWT `Authorization: Bearer`, verified
  with `@clerk/backend`.
- 2026-08-26 — The Fastify instance takes an injectable `SessionVerifier`; the
  database is never substituted (real Postgres, real migrations).
- 2026-08-27 — `packages/anchoring` canonicalization/hashing spec frozen.
- 2026-09-08 — Merkle anchoring spec frozen; anchoring runs in a separate
  `apps/worker`; a failing batch retries with backoff then goes terminal
  `anchor_failed`.
- 2026-09-09 — Evidence / review / dispute / saved-article / follow lists
  keyset-paginate on the row `id`.
- 2026-09-09 — Dispute slice: `dispute:file` shares the `review:create` gate;
  `respond` = membership; `withdraw` = the filer alone; `resolve` = the filer or
  a `role === "admin"` account.
- 2026-09-09 — `GET /articles/{id}/verification`: TrustStatus derived at read
  time; anchor state not an input; 404 body is `{ trustStatus: "notfound" }`.
- 2026-09-09 — Credibility computed at read time; cached column not written
  *(history table written as of Sprint 14; cached column still not)*.
- 2026-09-09 — Admin queues: a single `{ type: "admin" }` action; decisions
  record author + timestamp, permissive on current state, `404` only unknown id.
- 2026-09-10 — Account provisioning (Sprint 10): `POST /publishers` /
  `/reviewers/apply` behind `requireAuth`; lazy `ensureAccount` keyed by the
  verified `clerkUserId`, first-writer-wins; placeholder `clerk_org_id`.
- 2026-09-10 — Version verification (Sprint 11): `version:verify` = the
  `review:create` predicate; append-only `version_verifications` row, never an
  `UPDATE` of `review_status`; no anchor precondition; `verified` derived at
  read time; no un-verify.
- 2026-09-10 — Redaction (Sprint 12): `{ type: "admin" }` gate; read-layer
  suppression only; `tombstoneHash` = `contentHash`; append-only (`0007`),
  one-per-version → `409`; the legal `reason` returned by no endpoint;
  `articleVersionSchema` content fields nullable + a `redaction` field.
- 2026-09-10 — Reader features (Sprint 13): `POST /readers` mirrors Sprint 10;
  six per-reader endpoints behind `requireActor`; saved-list `trustStatus`
  batched over the page; re-save/re-follow → `409`; `POST /saved-articles`
  requires a published version.
- 2026-09-10 — Publisher dashboard (Sprint 14): the three authed reads require
  only `requireActor` (any account), not membership; the other three are
  public; `404` an unknown publisher. `credibility_score_history` +
  `activity_events` written by a `PublisherEventRecorder`; a credibility point
  only when the recomputed score changed; the cached column stays unwritten.
  `GET /publishers/{id}/reviews` merges reviews + disputes with a composite
  `<createdAt>~<kind>~<id>` cursor. Tier ladder `≥90 Outstanding / ≥75
  Excellent / ≥60 Good / ≥40 Fair / else Poor`.
- 2026-09-10 — Hardening (Sprint 15): in-memory `@fastify/rate-limit` (Redis
  swap documented), per-IP, tighter on mutating methods, health exempt, `429` →
  `{ code: "RATE_LIMITED" }`. `buildApp` is `async` (rate-limit plugin ordering).
  Error tracking is structured pino logging with a `fingerprint`, **not** a
  vendor SDK. Framework `4xx` (413/415/429) map onto the standard envelope.
  `0008` adds `saved_articles(account_id,id)` + `publisher_follows(account_id,id)`.
  Backups + restore documented in `RUNBOOK.md`, not executed. Confirmed with the
  user.
- 2026-09-10 — Real chain AnchorProvider (Sprint 16): **Base Sepolia now,
  mainnet = config**. A tiny in-repo Anchor contract
  (`packages/anchoring-contract`, `mapping(bytes32=>bool)` guard +
  `Anchored(bytes32 indexed root,…)` event) rather than EAS. **Raw signing key
  in the worker env** (`ANCHOR_SIGNER_PRIVATE_KEY`, faucet-funded); KMS / gas
  relayer is deferred production hardening at the `ChainOps` seam. The real
  provider lives in **`apps/worker`** (viem dep) so `packages/anchoring` stays
  zero-dependency; unit-tested against a contract-faithful in-memory model plus
  one env-gated live test. `submit` idempotency = pre-check the `Anchored` log +
  the contract's revert-on-repeat. Env-selected: `ANCHOR_RPC_URL` set → chain,
  unset → fake. `FAKE_ANCHOR_CONFIRMATIONS` renamed `ANCHOR_CONFIRMATIONS`.
  Confirmed with the user.
- 2026-09-10 — Real ObjectStore (Sprint 17): **bucket stays private; a
  dedicated `GET /versions/{id}/evidence/{evidenceId}/file` mints a fresh
  presigned URL on every call and redirects**, over a public-read bucket with a
  stable baked-in URL. `ObjectStore` gained `getSignedUrl(key)`; the fake
  returns an inert `memory://unconfigured-object-store/<key>`. S3-compatible via
  `@aws-sdk/client-s3` — any provider (S3, R2, B2, MinIO), not AWS-only. `put`
  idempotent on the content-addressed key via a `HeadObject` check. Env-selected:
  `OBJECT_STORE_BUCKET` set → real, unset → fake. Confirmed with the user.
- 2026-09-12 — Real SourceArchiver (Sprint 18): **the guard blocks by resolved
  IP range (hand-rolled on `node:net`'s `BlockList`/`isIP`), not a hostname
  allow-list** — no SSRF library added; confirmed with the user over pulling in
  a dedicated npm package for the IP/redirect validation. **No env toggle** —
  unlike the chain/object-store fakes, the guarded fetch needs no credentials
  to provision, so it's the unconditional default in `app.ts`; the deterministic
  fake is instead pinned explicitly in `test/testApp.ts` for the (offline)
  integration suite. `http:`/`https:` only; 25 MB body cap; 15s per-hop timeout;
  5 redirects max, every hop re-validated identically to the first (scheme,
  DNS-resolve, address-block-check) before it's fetched.

## Open questions

- *(none ranked as blocking)*.

## Known debt and deviations

- **Docker is not available in this dev environment**, across sixteen sprints.
  `embedded-postgres` binaries are execution-blocked from `%LOCALAPPDATA%\Temp`
  on this host; copied to a non-temp path (`D:\…`) they run. Everything that
  mattered was verified against a real PostgreSQL 16.14 driven from
  `initdb` / `pg_ctl` on a non-temp path, torn down afterward. **CI on GitHub's
  `ubuntu-latest` runs the full suite via Testcontainers and is green
  (2026-09-10)** — the Testcontainers path is proven; only a local
  `docker compose up` remains unrun.
- **CI runs and is green.** `.github/workflows/ci.yml` fix (2026-09-10):
  `pnpm/action-setup@v4` must not set `version:` when `package.json` has a
  `packageManager` field — it errors on both; `checkout`/`setup-node` at `@v5`.
- **No local EVM** (Foundry / anvil not available, same class as Docker) and no
  funded testnet key — the Sprint 16 chain provider's **live path is unrun**.
  `solc` compiled the contract; the provider logic is unit-tested against a
  contract-faithful model; the live e2e test is env-gated.
- **`viem` is a worker runtime dependency** now (~1 MB) — unavoidable for real
  chain access; not pulled into `packages/anchoring` or `apps/api`.
- **`packages/anchoring-contract/artifacts/Anchor.json` is committed** (keeps a
  Solidity toolchain out of CI / the worker) — regenerate with
  `pnpm --filter @sourceit/anchoring-contract build` after any contract edit;
  `artifact.test.ts` fails if it is stale.
- **`@fastify/rate-limit` does not limit under vitest's module runner** (works
  in real Node) — the rate-limit test is a spawned plain-Node subprocess
  (`test/fixtures/rate-limit-smoke.cjs`). Its config is inlined there *and* in
  `src/plugins/rateLimit.ts` (the fixture is CJS and can't import the TS);
  low drift risk, comment links them.
- **`buildApp` is async** — paid to a Fastify v5 + rate-limit v10 registration
  ordering quirk; both call sites (`server.ts`, `testApp.ts`) updated.
- **Backups / restore not executed** — plan only, in `RUNBOOK.md`.
- **`CREATE INDEX CONCURRENTLY` not used for 0008** — small indexes; the runbook
  covers the concurrent path.
- **Drizzle anchoring-index snapshot drift** — `schema/anchoring.ts` still lacks
  `anchor_records_status_idx` / `anchor_batches_status_idx` (0005 hand-written).
  The `0007` snapshot `id`/`prevId` was fixed in Sprint 15 so `drizzle-kit
  generate` chains again; the anchoring index gap remains, repay when anchoring
  is next touched.
- **`articleVersionSchema` content fields are `string | null` for every
  consumer** (Sprint 12); non-redacted data never returns `null`.
- **`GET /publishers/{id}/reviews` re-queries both tables per page** from the
  cursor timestamp; fine at year-one volume.
- **`GET /publishers/{id}/articles` is not redaction-suppressed**;
  **`changeSummary` not blanked**; **redaction irreversible**; **no un-verify**.
- **`article_versions.review_status = 'verified'` is dead as an API outcome**
  (Sprint 11); honoured by the read overlay if present.
- **`activity_events` covers only the `apps/api` write paths.**
- **The cached `publishers.credibility_score` / `transparency_level` columns
  stay unwritten.**
- **No verifier identity in the composed verification read.**
- **`RegisterForm.tsx` wired for all three roles but not integration-tested** —
  needs a live Clerk project.
- **`registryMember` / `versionMatch` trustSummary facts are `true` on every
  200.**
- **Version-scoped `evidence` / `reviews` in the verification response use
  `LIMIT 1000`.**
- **`Actor.role` is typed `string`, not the `account_role` enum.**
- **`dispute:file`, `review:create`, `version:verify` share a switch `case`.**
- **Dispute withdrawal is filer-only, even for an admin.**
- **Evidence hashes are not anchored.**
- **No admin re-queue for `anchor_failed`.** (Real chain `AnchorProvider` built
  Sprint 16 — live run pending a deploy. Real `ObjectStore` built Sprint 17 —
  no bucket provisioned here. Real `SourceArchiver` built Sprint 18.)
- **The guarded `SourceArchiver`'s full DB-backed integration run is
  unconfirmed this session** — no Postgres instance was available (Sprint 18);
  the substitution in `test/testApp.ts` is like-for-like with the prior default,
  and the module is fully covered by 40 standalone unit tests (real local
  server + injected-dependency orchestration), but the previously-verified
  208/208 `apps/api` total wasn't re-run.
- **`ObjectStore.get()` has no caller** — complete and unit-tested since Sprint 17,
  but nothing in the product reads a stored blob server-side yet.
- **No lifecycle/expiry policy on the evidence bucket** — deliberate (evidence
  is meant to persist as long as its version), stated explicitly so nobody
  attaches one by habit.
- **`articles.repository.ts` cursor pagination keys on a millisecond-truncated
  `created_at`** (`listPublishedVersions`, `listForPublisher`).
- **`apps/web` has no `tsconfig.json`** (Figma Make export); `vite build` is its
  only standing check.
- **`apps/worker` duplicates `apps/api`'s `startTestDb` + pool setup** (~30
  lines).
- **`docs/ANCHORING.md`'s leaf-order rule is enforced by `ORDER BY`, not a
  constraint.**
- **The `TEST_DATABASE_URL` escape hatch is single-file-parallelism only.**
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, dead since
  Sprint 1.

## How to run

Confirmed working this sprint (against a real PostgreSQL 16.14 via
`initdb`/`pg_ctl` on a non-temp path — Docker unavailable, `embedded-postgres`
binaries blocked from `%TEMP%`; `apps/web` via `vite build`):

```
pnpm install                                   # workspace install
pnpm typecheck                                 # api + worker + shared + anchoring + anchoring-contract — 0 errors
pnpm lint                                      # same five — 0 errors/warnings
pnpm --filter @sourceit/shared db:migrate      # applies all 9 migrations (0000–0008) for real — verified
pnpm --filter @sourceit/shared seed            # verified (2 articles, 2 saved, 2 follows, 1 redaction, 6 credibility points)
pnpm --filter @sourceit/anchoring test          # 33/33 — verified
pnpm --filter @sourceit/anchoring-contract test # 3/3 — verified (artifact ↔ source guard)
pnpm --filter @sourceit/anchoring-contract build # recompile Anchor.sol → artifacts/Anchor.json (solc-js)
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 208/208 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/worker exec vitest run --no-file-parallelism  # 15 pass + 1 skipped (live chain test, env-gated)
pnpm --filter @sourceit/shared openapi:generate && pnpm --filter @sourceit/shared client:generate  # regenerated, not hand-edited
pnpm dev                                        # runs apps/api + apps/worker in parallel; both need ../../.env
pnpm --filter @sourceit/web dev                # needs apps/web/.env.local (VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL)
pnpm --filter @sourceit/web build              # 2204 modules — verified
```

`.env` for `pnpm dev`: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `CORS_ORIGIN`, and optionally `RATE_LIMIT_MAX` /
`RATE_LIMIT_WRITE_MAX` / `RATE_LIMIT_WINDOW_MS` — and, to store evidence in a
real bucket instead of the in-memory fake, `OBJECT_STORE_BUCKET` +
`OBJECT_STORE_REGION` + `OBJECT_STORE_ACCESS_KEY_ID` +
`OBJECT_STORE_SECRET_ACCESS_KEY` (+ optional `OBJECT_STORE_ENDPOINT` /
`OBJECT_STORE_FORCE_PATH_STYLE` / `OBJECT_STORE_SIGNED_URL_TTL_SECONDS`, default
900s) (api); the worker reads the same file and takes optional `ANCHOR_TICK_MS`
/ `ANCHOR_MAX_BATCH` / `ANCHOR_MAX_ATTEMPTS` / `ANCHOR_CONFIRMATIONS`, and — to
anchor on a real chain instead of the fake — `ANCHOR_RPC_URL` +
`ANCHOR_CHAIN_ID` + `ANCHOR_CONTRACT_ADDRESS` + `ANCHOR_SIGNER_PRIVATE_KEY`
(+ optional `ANCHOR_CONTRACT_DEPLOY_BLOCK`). `apps/api` also accepts injected
`objectStore` / `sourceArchiver` in `buildApp`.

Operational docs: `docs/RUNBOOK.md` (incl. "Chain anchoring" and "Object
storage"), `docs/THREAT_MODEL.md`, `docs/PERFORMANCE.md`, `docs/ANCHORING.md`.

Still not possible here: `docker compose up` / Testcontainers (need Docker); a
local EVM (Foundry / anvil) or a funded testnet key, so the chain provider's
live run is deferred to a deploy; no cloud account/credentials, so the object
store's live HTTP round-trip to a real bucket is likewise deferred (its logic,
including URL signing, is fully unit-tested without one). On Windows, prefer a
Postgres install outside
`%LOCALAPPDATA%\Temp` — binaries under the temp tree are execution-blocked on
this host. A killed launcher can leave an orphaned `postgres.exe` on the test
port — check with `Get-NetTCPConnection -LocalPort <port>`.
