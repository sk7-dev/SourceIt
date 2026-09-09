# SourceIt — Project State
**Last updated:** end of Sprint 4  ·  **Current phase:** Phase 4 (remaining slices) — Anchoring slice complete, verified against a real Postgres

## Resume here

The Anchoring slice is done. A submitted version's content hash is now batched
into a Merkle tree by a new durable worker (`apps/worker`), the root is anchored
through a pluggable `AnchorProvider` (in-memory fake only this sprint), and
`GET /versions/{versionId}/anchor` returns the version's explicit anchor state
plus — once anchored — an inclusion proof that verifies **offline** against the
chain with no SourceIt database access. The exact Merkle/proof procedure is
frozen in [docs/ANCHORING.md](ANCHORING.md), companion to
[docs/CANONICALIZATION.md](CANONICALIZATION.md). The worker is idempotent and
crash-safe (proved by tests: kill it anywhere, no record lost or anchored
twice); a batch whose chain submission keeps failing retries with backoff and,
after 5 attempts, goes terminal `anchor_failed`, surfaced to readers like any
other state. The frontend Integrity Record on `/verification-result/:articleId`
now shows the real anchor state instead of a hardcoded "verified." See
[SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md).

Still mock / unbuilt, deliberately: no real chain provider (fake only, by
decision); no admin re-queue for `anchor_failed` (terminal this sprint);
`GET /articles/{id}/verification` and everything on `/verification-result`
except headline / version history / Integrity Record (needs Evidence, Review,
Dispute); account provisioning / `RegisterForm`; any backend search.

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Read the frontend; produce domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |
| 3 | Article vertical slice: full backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |
| 4 | Anchoring slice: Merkle tree + proof + AnchorProvider, durable crash-safe worker, GET /versions/{id}/anchor, frontend anchor state | Complete with carryover | [SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. 18 tables (unchanged since
Sprint 1); Sprint 4 only added columns to `anchor_batches`.

```
Account ──has role──> reader | publisher | reviewer | admin
  (mirrors a Clerk user; role-specific profile lives in Reviewer or PublisherMember)

Publisher ──mirrors──> Clerk Organization
Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership, also the
                                                            reviewer-COI join table]
Publisher (1) ──has──> (N) CredibilityScoreHistory point
Publisher (1) ──publishes──> (N) Article

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained
                                              via previousVersionId/previousHash]
ArticleVersion (1) ──has──> (N) Evidence          [binds to version, not article]
ArticleVersion (1) ──has──> (1) AnchorRecord      [pending/anchored/anchor_failed,
                                                    always present once submitted;
                                                    merkleProof + batch's root/tx
                                                    filled by apps/worker on confirm]
ArticleVersion (1) ──has──> (0..1) Redaction      [public tombstone, if redacted]
ArticleVersion (1) ──has──> (N) Review            [append-only; retraction = a
                                                    ReviewRetraction row, never an
                                                    UPDATE]
ArticleVersion (1) ──has──> (N) Dispute           [separate entity, own lifecycle]
Dispute        (1) ──has──> (N) DisputeEvent      [append-only lifecycle log;
                                                    current status = latest event,
                                                    or "open" if none]

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute

Account(reader) ──saves───> (N) SavedArticle ──> Article
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher

Publisher (1) ──has──> (N) ActivityEvent     [audit-trail feed]
AnchorBatch (1) ──has──> (N) AnchorRecord    [one Merkle batch = one chain tx;
                                              mutable: pending→submitted→confirmed,
                                              or failed after retry-with-backoff]
```

TrustStatus (6 values: authentic, authentic_under_review, updated, disputed,
publisher_unverified, notfound) is **not a table** — computed at read time by
`GET /articles/{id}/verification`, per docs/DOMAIN.md #12. Still unbuilt.

## Implemented endpoints

`packages/shared/openapi.json` defines the full contract (33 endpoints); 10 are
implemented, all verified against a real database. `GET /healthz` / `GET /readyz`
also exist but are intentionally not in `openapi.json`.

| Method | Path | Auth | Sprint introduced |
|---|---|---|---|
| GET | /me | Clerk bearer token | 2 |
| POST | /articles | Clerk bearer token | 3 |
| GET | /articles/{articleId} | public | 3 |
| GET | /articles/{articleId}/versions | public | 3 |
| GET | /articles/{articleId}/versions/{versionId} | public + optional owner | 3 |
| POST | /articles/{articleId}/versions | Clerk bearer token | 3 |
| PATCH | /articles/{articleId}/versions/{versionId} | Clerk bearer token | 3 |
| DELETE | /articles/{articleId}/versions/{versionId} | Clerk bearer token | 3 |
| POST | /articles/{articleId}/archive | Clerk bearer token | 3 |
| GET | /publishers/{publisherId}/articles | Clerk bearer token | 3 |
| GET | /versions/{versionId}/anchor | public | 4 |

## Decisions

- 2026-07-08 — Proposed Railway as the deployment target (Fly.io as documented
  fallback). Why: matches "prefer boring" for a monolith + worker + Postgres shape at
  year-one scale; rejected Vercel+Neon specifically because the durable anchoring
  worker doesn't fit a serverless function model. Revisit if regional/scaling control
  becomes a real requirement. **Confirmed 2026-08-26, no override.**
- 2026-07-08 — Proposed Clerk for auth. Why: its Organizations primitive maps directly
  onto Publisher orgs with member users, avoiding hand-built membership/invite
  plumbing, and offloads credential/session security to a vendor rather than
  hand-rolling it for a trust-critical product. Revisit if Clerk pricing becomes
  prohibitive at scale. **Confirmed 2026-08-26, no override.**
- 2026-07-08 — Decided to treat the frontend as a strong spec for Publisher and
  Reader/Verifier flows but not for Reviewer flows or most build-prompt invariants
  (disputes, redaction, anchor pending/failed states), since those have no frontend
  representation at all.
- 2026-08-26 — Anchor state: every version always shows an explicit
  pending/anchored/anchor_failed badge (`anchor_records.status`), never an
  optimistic "verified." Why: the frontend never rendered pending/failed and the
  build prompt calls hiding this a bug, not a rendering choice. Revisit: never —
  this is a hard invariant, not a preference. **Enforced in Sprint 4:
  `IntegrityRecord` no longer hardcodes a status.**
- 2026-08-26 — Dispute is a separate entity (`disputes` + append-only
  `dispute_events`), not `Review{type:"dispute"}`, and a publisher may respond with
  free text and/or a correction version but never resolve, withdraw, or hide a
  dispute themselves. Why: the frontend had zero dispute UI to reverse-engineer,
  and the build prompt names "cannot suppress a dispute" as a hard invariant.
  Revisit: never, without a build-prompt-level invariant change.
- 2026-08-26 — Credibility score v1 uses exactly the 3 factors the frontend shows
  (verified articles, disputed claims, transparent corrections); "anchoring
  discipline" and "evidence completeness" (named in the build prompt, never shown
  in UI) are deferred. Why: keep the published formula auditable and simple to
  start. Revisit: when either factor is actually needed, as a versioned formula
  change, not a silent addition.
- 2026-08-26 — Reviewer conflict-of-interest is enforced via `publisher_members`
  (structural org membership), not the free-text `affiliation` field. Why: only a
  structural check is a real DB constraint the build prompt's "enforce it, don't
  disclose it" requires. Revisit: if reviewers need to be blocked from
  ex-employers too (self-declared history), which was considered and deferred.
- 2026-08-26 — Redaction tombstones (`redactions` table) are fully public:
  category, position, hash, and timestamp all visible to any reader. Why: matches
  the build prompt's transparency invariant most directly; the legal detail
  (`reason`) is not part of the public schema. Revisit: if a redaction category
  ever needs to stay confidential even in aggregate, which no current requirement
  calls for.
- 2026-08-26 — Publisher verification state machine: unverified → pending →
  verified, plus a rejected terminal state, approved by an `admin`-role account.
  Reviewer approval mirrors this exactly. Why: symmetry with the reviewer queue,
  which the user explicitly asked to build (see next decision), plus the frontend's
  own "pending admin approval" copy implies a real accept/reject step exists
  somewhere. **Confirmed 2026-08-26** at the Sprint 1 stop point: one `admin`
  role handles both queues, no second staff role.
- 2026-08-26 — Article review status (draft/pending_review/verified) and anchor
  status (pending/anchored/anchor_failed) are independent columns on
  `article_versions`/`anchor_records`; `Disputed` is not a status at all, just
  "this version has an open dispute," computed by querying `disputes`/`dispute_events`.
  Why: the two tracks can legitimately disagree (e.g. verified-but-disputed), which
  a single combined enum can't represent. Revisit: never, without a product
  requirement that collapses the tracks.
- 2026-08-26 — Reader-facing trust status has 6 values, not the 4 the frontend
  implements (`authentic`, `authentic_under_review`, `updated`, `disputed`,
  `publisher_unverified`, `notfound`). Why: matches the original design brief in
  full; `authentic_under_review` and `publisher_unverified` are real, distinct
  trust postures the 4-value set can't express. Revisit: never without a design
  change.
- 2026-08-26 — Evidence with `tag=source` is fetched and hashed (archived) at
  submission time, not merely linked (`evidence.isArchivedSnapshot`,
  `evidence.sourceUrl`). Why: verification must not silently degrade when a
  third-party URL rots. Revisit: if archival storage cost becomes material at
  scale, which is not expected at year-one volume.
- 2026-08-26 — Reviewer approval has a real admin queue and `admin` role
  (`reviewers.approvalStatus`, `PATCH`-equivalent decision endpoint), not manual
  database edits. Why: user explicitly chose to build this over the
  lower-scope "manual for now" option. Revisit: never without a scope-reduction
  ask.
- 2026-08-26 — A publisher can archive an article at any lifecycle stage; a
  never-submitted draft version can be hard-deleted (the one exception to
  append-only), enforced by `reject_non_draft_update_delete()` checking
  `review_status = 'draft'`. Why: nobody has seen an unpublished draft, so nothing
  is lost by deleting it outright. Revisit: never without a change to what
  "append-only" is meant to protect.
- 2026-08-26 — Reviews may be publicly attributed by a pseudonym
  (`reviewers.pseudonym`, `useLegalName`); the real name (`accounts.fullName`) is
  always retained and never exposed by any public-facing schema
  (`ReviewerPublic`). Why: user chose pseudonym support over public-real-name-only.
  Revisit: never without a change to the accountability requirement.
- 2026-08-26 — `/simple-login` and `/reader-portal` are confirmed dead and slated
  for deletion; the rest of the sidebar's unwired local state is left alone
  (single-scrolling-page layout is intentional, not a bug). Why: user confirmed
  both routes are unreachable/duplicate. **Not yet executed.**
- 2026-08-26 — `/article-edit-history`'s full version-history data gets a second,
  public, unauthenticated route (`GET /articles/{id}/versions`,
  `GET /articles/{id}/versions/{versionId}`) alongside the existing authenticated
  publisher route. Why: build prompt requires version history to be public like
  verification itself; user confirmed both routes should exist rather than
  replacing the authenticated one. Revisit: never without a requirement change.
- 2026-08-26 — Schema entity names confirmed at the Sprint 1 stop point as
  matching the business's own language — no renames.
- 2026-08-26 — Session auth is a Clerk-issued JWT passed as an `Authorization:
  Bearer <token>` header, verified server-side with `@clerk/backend`'s
  `verifyToken`. Revisit: never without dropping Clerk itself.
- 2026-08-26 — `apps/api`'s Fastify instance takes an injectable
  `SessionVerifier`; production uses real Clerk verification, tests substitute a
  fixed token→clerkUserId mapping. The database is never substituted this way —
  Testcontainers Postgres, real migrations, always.
- 2026-08-27 — `packages/anchoring`'s canonicalization/hashing spec is frozen
  (`docs/CANONICALIZATION.md`): SHA-256 over a deterministic, recursively
  key-sorted JSON serialization of exactly 8 version-content fields, via Web
  Crypto. Revisit: never without a new spec version.
- 2026-08-27 — `apps/api` gets CORS via `@fastify/cors`, origin controlled by
  `CORS_ORIGIN` (comma-separated allowlist outside development; any origin in
  development). Revisit: set `CORS_ORIGIN` explicitly before any non-development
  deployment.
- 2026-08-27 — `apps/web`'s auth UI handles Clerk's `needs_second_factor`
  sign-in status inline in `LoginForm`, found live. Revisit: never, unless
  Clerk's second-factor strategy set changes.
- 2026-09-08 — Merkle anchoring spec frozen (`docs/ANCHORING.md`): leaf =
  `SHA-256(0x00 ‖ contentHashBytes)`, node = `SHA-256(0x01 ‖ left ‖ right)`
  (RFC-6962-style domain separation), lonely node promoted unchanged (not
  duplicated), inclusion-proof entries `{hash, side}` ordered leaf→root, leaf
  order `(created_at, article_version_id)`. Why: the build prompt requires the
  verification procedure be a public frozen spec; confirmed shape with the user.
  Revisit: never without a new spec version — any change invalidates every root
  and proof already computed.
- 2026-09-08 — Anchoring runs in a **separate `apps/worker` process**, not
  in-process in `apps/api`. Why: matches the build prompt's "durable job runner"
  and the Railway monolith+worker+Postgres deploy shape; keeps the public read
  path's uptime independent of the worker. Confirmed with the user. Revisit: if
  operational simplicity of one process ever outweighs the isolation.
- 2026-09-08 — A batch whose chain submit/confirm keeps failing retries with
  exponential backoff (`min(2^attempts, 60)`s) and, after `ANCHOR_MAX_ATTEMPTS`
  (default 5), is set `failed` with its records set **terminal `anchor_failed`**.
  Recovering a stuck `anchor_failed` version needs a future admin re-queue
  endpoint (not built). Why: confirmed with the user over retry-forever and
  fail-immediately. Revisit: when the re-queue path is actually needed.
- 2026-09-08 — Sprint 4 ships only `createFakeAnchorProvider` (in-memory,
  idempotent on root). No real L2 chain integration. Why: confirmed with the
  user; enough to exercise the full worker/proof/state machine, and a real
  provider plugs in at the `AnchorProvider` interface with no worker or schema
  change. Revisit: when a real chain is actually being deployed to.
- 2026-09-08 — `anchorRecordSchema` (Sprint 1) amended on implementation:
  `merkleProof` is `{hash, side}[]` not `string[]`; the leaf field is renamed
  `contentHash` (the value a verifier hashes; the Merkle leaf is the
  domain-separated derivation); `merkleRoot` + `chainTxHash` added from the
  batch. Documented inline. Why: the Sprint 1 shape couldn't express a real
  inclusion proof. Revisit: never without a contract change.
- 2026-09-08 — `confirmBatch` falls back to `provider.submit()` (idempotent on
  root) when `provider.getReceipt()` throws, so a `submitted` batch is always
  drivable to completion from the persisted root alone. Why: a failing test
  showed a batch could wedge after a restart that lost provider state. Revisit:
  if a real provider's `submit` is ever not safe to call repeatedly (the
  interface contract forbids that).

## Open questions

None outstanding.

## Known debt and deviations

- **Docker is still never available in this environment**, across four sprints.
  `docker compose up`, the Testcontainers test path, and CI have never actually
  run here. Everything that mattered (all 6 migrations, seed, all 10 endpoints,
  the worker's full pipeline, the frontend flow) was verified via a scratch
  `embedded-postgres` outside the repo, torn down after. What's left: confirm CI
  goes green on GitHub's runners once something is pushed, and confirm
  `docker compose up` specifically.
- **CI has never run.** Unchanged — nothing pushed since Sprint 2 added the
  workflow. `apps/worker` was added to root `lint` / `typecheck` / `test` this
  sprint but the workflow file itself was not reviewed for whether it picks that
  up.
- **No real `AnchorProvider`.** Fake only, by decision — see Decisions
  2026-09-08. Repay when deploying to a real chain.
- **No admin re-queue for `anchor_failed`.** Terminal in Sprint 4. A version
  stuck there needs a future endpoint; today only a manual DB update resets it.
- **`GET /articles/{id}/verification` still unbuilt.** Needs Evidence, Review,
  Dispute. Most of `/verification-result` is still mock because of this — the
  Integrity Record is now real, the trust summary / evidence / credibility /
  reviewer notes are not.
- **`RegisterForm.tsx` still unwired.** Needs local-account provisioning plus
  `POST /publishers` and `POST /reviewers/apply` handlers (in `openapi.json`,
  no routes). Approach (Clerk headless hooks) confirmed; backend not built.
- **No backend search endpoint** — `VerificationHero`'s search/scan tabs,
  `RecentlyVerified`, `SavedArticles` still navigate to the param-less mock
  verification route.
- **`apps/web` has no `tsconfig.json`.** Pre-existing (Figma Make export).
  `vite build` is its only standing check; files touched each sprint are
  checked ad-hoc with explicit `tsc` flags, which surface only known
  environmental gaps.
- **`apps/worker` duplicates `apps/api`'s `startTestDb` helper and `db.ts` pool
  setup** (~30 lines), by the same per-app-owns-its-data-access decision as
  Sprint 3. Repay by extracting a test-support package only if a third app
  needs it.
- **`docs/ANCHORING.md`'s leaf-order rule is enforced by an `ORDER BY`, not a
  constraint.** One code path builds trees; it is tested. A second path in a
  different order would produce a different root.
- **The `TEST_DATABASE_URL` escape hatch is single-file-parallelism only**
  (`apps/api` needs `--no-file-parallelism`; `apps/worker`'s vitest config sets
  `fileParallelism: false`). Enforced by config/comment, not tooling.
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, dead since
  Sprint 1. Still deferred.
- **Fixed but worth tracking:** Sprint 3's append-only trigger silently
  discarding every write, and `apps/api` having no CORS — both fixed in Sprint 3,
  both only catchable from a real browser. Sprint 4's "crash between submit and
  confirm" wedge — fixed, only catchable by a test that models a provider
  restart. Automated tests alone are not sufficient proof a sprint is done.

## How to run

Confirmed working this sprint (against a real Postgres via `embedded-postgres`,
not Docker's; `apps/web` via `vite build`):

```
pnpm install                                   # workspace install — verified
pnpm typecheck                                 # apps/api + apps/worker + packages/shared + packages/anchoring — 0 errors
pnpm lint                                      # same four — 0 errors/warnings
pnpm --filter @sourceit/shared db:migrate      # applies all 6 migrations for real — verified
pnpm --filter @sourceit/shared seed            # verified against a real database
pnpm --filter @sourceit/anchoring test         # 33/33 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 25/25 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/worker exec vitest run                        # 7/7 — verified
pnpm --filter @sourceit/shared openapi:generate && pnpm --filter @sourceit/shared client:generate  # regenerated, not hand-edited
pnpm dev                                        # runs apps/api + apps/worker in parallel; both need ../../.env
pnpm --filter @sourceit/web dev                # needs apps/web/.env.local (VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL)
pnpm --filter @sourceit/web build              # 2204 modules — verified
```

`.env` for `pnpm dev`: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `CORS_ORIGIN` (api); the worker reads the same file and
takes optional `ANCHOR_TICK_MS` / `ANCHOR_MAX_BATCH` / `ANCHOR_MAX_ATTEMPTS` /
`FAKE_ANCHOR_CONFIRMATIONS`, all with defaults.

Still not possible here: `docker compose up` specifically, or Testcontainers
(both need Docker).
