# SourceIt — Project State
**Last updated:** end of Sprint 6  ·  **Current phase:** Phase 4 (remaining slices) — Anchoring + Evidence + Review slices complete, verified against a real Postgres

## Resume here

The Review slice is done. An **approved** reviewer
(`reviewers.approval_status = 'approved'`) with no `publisher_members` row for
the article's publisher can `POST /versions/{versionId}/reviews`
(`confirmation` / `clarification` / `correction_note`) against a published
version; the structural conflict-of-interest check lives in `can` and is
enforced without being disclosed. `GET /versions/{versionId}/reviews` is public
and cursor-paginated and 404s a draft/unknown version; it exposes only the
reviewer's public identity (`displayName` = pseudonym when chosen, never
`accounts.fullName`). `POST /reviews/{reviewId}/retract` inserts a
`review_retractions` row — the review itself is never touched, its comment stays
verbatim, and a second retract is a 409. The verification page's Reviewer Notes
panel renders that real list. No migration — the `reviews` /
`review_retractions` tables and their triggers have existed since Sprint 1.
`createAuthorization` now takes a second arg (`reviewersRepo`); the three other
routes that build an authorizer were updated. See
[SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md).

Still mock / unbuilt, deliberately, after Sprint 6:

- **`GET /articles/{id}/verification` still unbuilt** — now needs only Dispute
  data + the trust-status computation (Evidence and Review both exist).
  TrustSummaryCard and PublisherCredibility on `/verification-result` stay mock
  until it lands.
- **No reviewer-facing write UI** — there is essentially no reviewer frontend
  in the Figma Make export; submitting/retracting a review from the browser
  would be new component structure (deferred). `ReviewsDisputes.tsx` (reviews +
  disputes in one publisher view) is untouched, waiting on the Dispute slice.
- **Conflict of interest is current-membership-only** — a reviewer's
  self-declared past employer (`reviewers.affiliation` free text) does not block
  them; only a live `publisher_members` row does (Sprint 1 decision).
- Carried from Sprint 5: evidence hashes not anchored; no real `ObjectStore` /
  `SourceArchiver` / evidence-blob-read endpoint; evidence frontend write path
  unwired.
- Carried from Sprint 4: no real chain `AnchorProvider` (fake only); no admin
  re-queue for `anchor_failed`.
- Carried longer: account provisioning / `RegisterForm`; any backend search.

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Read the frontend; produce domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |
| 3 | Article vertical slice: full backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |
| 4 | Anchoring slice: Merkle tree + proof + AnchorProvider, durable crash-safe worker, GET /versions/{id}/anchor, frontend anchor state | Complete with carryover | [SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md) |
| 5 | Evidence slice: multipart POST + public GET /versions/{id}/evidence, content-addressed ObjectStore + SourceArchiver seams (fakes), append-only, frontend evidence list | Complete with carryover | [SPRINT_5_REPORT.md](sprints/SPRINT_5_REPORT.md) |
| 6 | Review slice: GET/POST /versions/{id}/reviews + POST /reviews/{id}/retract, approved-reviewer gate, structural COI enforcement, append-only retraction, frontend reviewer notes | Complete with carryover | [SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. 18 tables, **unchanged since
Sprint 1** (Sprint 4 added columns to `anchor_batches`; Sprints 5 and 6 added no
schema at all — both built against Sprint 1 tables that already fit).

```
Account ──has role──> reader | publisher | reviewer | admin
  (mirrors a Clerk user; role-specific profile lives in Reviewer or PublisherMember)

Publisher ──mirrors──> Clerk Organization
Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership, also the
                                                            reviewer-COI join table —
                                                            a members row for the
                                                            publisher blocks review:create]
Publisher (1) ──has──> (N) CredibilityScoreHistory point
Publisher (1) ──publishes──> (N) Article

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained
                                              via previousVersionId/previousHash]
ArticleVersion (1) ──has──> (N) Evidence          [binds to version, not article;
                                                    attached only while draft, then
                                                    frozen; bytes SHA-256'd +
                                                    content-addressed; tag=source
                                                    fetched+snapshotted]
ArticleVersion (1) ──has──> (1) AnchorRecord      [pending/anchored/anchor_failed,
                                                    always present once submitted]
ArticleVersion (1) ──has──> (0..1) Redaction      [public tombstone, if redacted]
ArticleVersion (1) ──has──> (N) Review            [append-only; attach only to a
                                                    non-draft version, by an approved
                                                    non-affiliated reviewer; retraction
                                                    = a ReviewRetraction row, never an
                                                    UPDATE; isRetracted/retractedReason
                                                    derived from that join]
ArticleVersion (1) ──has──> (N) Dispute           [separate entity, own lifecycle —
                                                    not yet built]
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

`packages/shared/openapi.json` defines the full contract (33 endpoints); 15 are
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
| GET | /versions/{versionId}/evidence | public | 5 |
| POST | /versions/{versionId}/evidence | Clerk bearer token | 5 |
| GET | /versions/{versionId}/reviews | public | 6 |
| POST | /versions/{versionId}/reviews | Clerk bearer token | 6 |
| POST | /reviews/{reviewId}/retract | Clerk bearer token | 6 |

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
  **Enforced in Sprint 6: the `review:create` gate in `can` denies an approved
  reviewer who is a `publisher_members` row for the publisher.**
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
  attach time, not merely linked (`evidence.isArchivedSnapshot`,
  `evidence.sourceUrl`). Why: verification must not silently degrade when a
  third-party URL rots. Revisit: if archival storage cost becomes material at
  scale. **Implemented in Sprint 5 behind a `SourceArchiver` seam; only the
  in-memory fake ships.**
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
  Revisit: never without a change to the accountability requirement. **Enforced in
  Sprint 6: `reviews.service.ts` derives `displayName` and never selects
  `fullName` into the response.**
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
  `contentHash`; `merkleRoot` + `chainTxHash` added from the batch. Documented
  inline. Why: the Sprint 1 shape couldn't express a real inclusion proof.
  Revisit: never without a contract change.
- 2026-09-08 — `confirmBatch` falls back to `provider.submit()` (idempotent on
  root) when `provider.getReceipt()` throws, so a `submitted` batch is always
  drivable to completion from the persisted root alone. Why: a failing test
  showed a batch could wedge after a restart that lost provider state. Revisit:
  if a real provider's `submit` is ever not safe to call repeatedly.
- 2026-09-09 — `POST /versions/{versionId}/evidence` is `multipart/form-data`,
  amending the Sprint 1 `application/json` shape on implementation.
  `uploadEvidenceRequestSchema` is the non-file field set; a new
  `UploadEvidenceMultipart` OpenAPI schema adds the binary `file` part (absent
  for `tag=source`). `openapi.json` + client regenerated. Why: a real file
  upload can't ride in a JSON body; confirmed with the user. Revisit: never
  without a contract change.
- 2026-09-09 — Object storage and source-URL archival sit behind injectable
  `ObjectStore` / `SourceArchiver` seams in `apps/api` (defaulted in
  `buildApp`), with only in-memory/deterministic fakes shipped — same call as
  `AnchorProvider`. A real content-addressed store and a guarded server-side
  fetch (SSRF-listing, redirect/body caps, timeouts) plug in with no service or
  route change. Why: confirmed with the user; the real fetch is a Phase 5
  threat-pass concern. Revisit: when deploying somewhere real.
- 2026-09-09 — Evidence attaches only while the owning version is a draft; once
  it leaves draft the evidence set is frozen (409 on a later attach), and
  `evidence` rows are append-only (`evidence_append_only` trigger, since Sprint
  1). Why: "evidence binds to a version, not an asset" reads most cleanly as
  "binds at draft time, immutable thereafter"; matches the frontend. Revisit:
  never without a change to what append-only protects.
- 2026-09-09 — `GET /versions/{versionId}/evidence` (and, Sprint 6,
  `GET /versions/{versionId}/reviews`) keyset-paginate on the row `id`, not
  `created_at`. Why: Postgres `timestamptz` is microsecond, a JS `Date`/ISO
  string is millisecond, so a `created_at` cursor re-serves same-millisecond
  rows (a real test caught this). Order within a version's evidence/reviews is a
  flat list, so `id` order costs nothing. Revisit: if a guaranteed
  chronological read is ever needed, use a full-precision composite cursor.
- 2026-09-09 — `POST /versions/{versionId}/reviews` requires the version to be
  non-draft and the caller to be an `approved` reviewer who is **not** a
  `publisher_members` row for the publisher; the check lives in `can`
  (`review:create`), and its denial message names the rule but never the
  caller's own affiliation. `POST /reviews/{reviewId}/retract` is author-only
  and models retraction as an append-only `review_retractions` row
  (UNIQUE `review_id` → second retract is 409); `isRetracted` /
  `retractedReason` are derived from a LEFT JOIN, never stored on `reviews`.
  `createAuthorization` gained a `reviewersRepo` parameter. Why: the build
  prompt's structural-COI and "original text intact" invariants. Revisit: never
  without an invariant change.

## Open questions

None outstanding.

## Known debt and deviations

- **Docker is still never available in this environment**, across six sprints.
  `docker compose up`, the Testcontainers test path, and CI have never actually
  run here. Everything that mattered (all 6 migrations, seed, all 15 endpoints,
  the worker's full pipeline, the frontend flow) was verified via a scratch
  `embedded-postgres` outside the repo, torn down after. What's left: confirm CI
  goes green on GitHub's runners once something is pushed, and confirm
  `docker compose up` specifically.
- **CI has never run.** Unchanged — nothing pushed since Sprint 2 added the
  workflow. The new `test/reviews.integration.test.ts` and the Sprint 5
  `@fastify/multipart` dependency are picked up by the root
  `lint`/`typecheck`/`test` scripts, but the workflow file itself still hasn't
  been reviewed for whether it runs them.
- **`GET /articles/{id}/verification` still unbuilt.** Now needs only Dispute
  data + the trust-status computation (Evidence and Review both exist). Most of
  `/verification-result` is real (headline, version history, Integrity Record,
  Supporting Evidence, Reviewer Notes); the trust summary and publisher
  credibility are still mock pending this endpoint.
- **No reviewer-facing write UI**, and **`ReviewsDisputes.tsx` untouched.**
  There is essentially no reviewer frontend to wire; a submission/retraction UI
  would be new component structure. `ReviewsDisputes.tsx` renders reviews +
  disputes together and waits on the Dispute slice. `ReviewerNotes`'s mock row
  is retained only as the no-`articleId` fallback.
- **Conflict of interest is current-membership-only.** A reviewer's declared
  past employer (`reviewers.affiliation`) does not block them. Per the Sprint 1
  decision; revisit only if ex-employer COI becomes a requirement.
- **The `review:create` denial message names the COI rule** ("approved reviewer
  with no affiliation"), revealing the rule exists though never the caller's own
  status. If even the rule's existence must be opaque, return a bare 403/404.
- **`createAuthorization` builds a `reviewersRepo` in three routes that never
  use a review action** (`articles`, `publisherArticles`, `evidence`). A
  zero-cost factory call; the optional-parameter alternative was worse.
- **Evidence hashes are not anchored.** Sprint 5 hashes and stores evidence
  bytes but does not feed those hashes into the Merkle tree — the worker batches
  version content hashes only. Repay when the anchoring model is next opened.
- **No real `ObjectStore`**, and **no endpoint to read a stored evidence blob**.
  In-memory fake only; blobs don't survive an API restart; "View File" on the
  verification page is inert.
- **No real `SourceArchiver`.** `createFakeSourceArchiver` does not touch the
  network. Repay with the Phase 5 threat pass.
- **Frontend evidence write path unwired.** `MediaEvidenceUpload.tsx` keeps
  files in local state and sends nothing; wiring needs a two-phase publish flow
  (a component restructure, deferred).
- **`apps/api/src/repositories/articles.repository.ts` cursor pagination keys on
  a millisecond-truncated `created_at` ISO string** (`listPublishedVersions`,
  `listForPublisher`) and can re-serve or skip a row sharing a millisecond with
  the page boundary. Pre-existing; the evidence and review lists dodge it by
  keying on `id`. Repay by moving those cursors to an `id`-keyset or a
  full-precision `(created_at, id)` composite when next touched.
- **`apps/api`'s error handler maps only `AppError` / `ZodError` / Fastify
  schema `validation` to the error envelope.** A `415` (body with no
  `Content-Type`) or a `413` (`@fastify/multipart` `fileSize` limit) becomes a
  generic `500`. No realistic client hits either. Repay by passing through a
  `FastifyError` with a 4xx `statusCode`.
- **No real `AnchorProvider`.** Fake only, by decision (2026-09-08). Repay when
  deploying to a real chain.
- **No admin re-queue for `anchor_failed`.** Terminal since Sprint 4. A version
  stuck there needs a future endpoint; today only a manual DB update resets it.
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
  discarding every write, and `apps/api` having no CORS — both fixed in Sprint 3.
  Sprint 4's "crash between submit and confirm" wedge — fixed. Sprint 5's
  millisecond-truncated evidence cursor — fixed, and the same keying used for
  reviews in Sprint 6. Automated tests alone are not sufficient proof a sprint
  is done, but a test that models the ugly timing is what caught the cursor bug.

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
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 56/56 — verified (38 prior + 18 review)
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/worker exec vitest run                        # 7/7 — verified
pnpm --filter @sourceit/shared openapi:generate && pnpm --filter @sourceit/shared client:generate  # regenerated, not hand-edited
pnpm dev                                        # runs apps/api + apps/worker in parallel; both need ../../.env
pnpm --filter @sourceit/web dev                # needs apps/web/.env.local (VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL)
pnpm --filter @sourceit/web build              # 2204 modules — verified
```

`.env` for `pnpm dev`: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `CORS_ORIGIN` (api); the worker reads the same file and
takes optional `ANCHOR_TICK_MS` / `ANCHOR_MAX_BATCH` / `ANCHOR_MAX_ATTEMPTS` /
`FAKE_ANCHOR_CONFIRMATIONS`, all with defaults. `apps/api` also accepts injected
`objectStore` / `sourceArchiver` in `buildApp` (tests and any real deployment);
unset, both default to the in-memory / fake implementation.

Still not possible here: `docker compose up` specifically, or Testcontainers
(both need Docker).
