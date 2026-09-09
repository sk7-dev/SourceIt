# SourceIt — Project State
**Last updated:** end of Sprint 7  ·  **Current phase:** Phase 4 (remaining slices) — Anchoring + Evidence + Review + Dispute slices complete, verified against a real Postgres

## Resume here

The Dispute slice is done. An approved, non-affiliated reviewer files a dispute
against a published version (`POST /versions/{versionId}/disputes`); the
disputed publisher's members can only append a `publisher_responded` event
(`/respond`: a note and/or a `correctionVersionId` that must be a *published*
version of the *disputed article*); the filer alone withdraws and the filer or
a site admin resolves (`/resolve`); the publisher can never resolve, withdraw,
hide, or delay it. Status is derived from the latest event (or `"open"`), the
lifecycle is append-only (triggers), and once terminal
(`withdrawn` / `resolved_*`) further events `409`. Both reads
(`GET /versions/{id}/disputes`, `GET /disputes/{id}`) are public and 404 only a
draft/unknown version. No migration — `disputes` / `dispute_events` and their
triggers exist since Sprint 1. `Actor` gained a `role` field (used only by
`dispute:resolve`). **Backend + tests only this sprint** — disputes have no UI
in the Figma export and will reach the frontend through
`GET /articles/{id}/verification`. See
[SPRINT_7_REPORT.md](sprints/SPRINT_7_REPORT.md).

`GET /articles/{id}/verification` is now **unblocked** — Evidence, Review, and
Dispute all exist. That composed endpoint plus the derived TrustStatus is the
natural next slice; it wires the last mock panels on `/verification-result`
(TrustSummaryCard, PublisherCredibility).

Still mock / unbuilt, deliberately, after Sprint 7:

- **`GET /articles/{id}/verification` unbuilt** (now unblocked). Needs the
  credibility computation (the 3 frontend-shown factors) and a written
  derivation for each of the 6 TrustStatus values.
- **No dispute frontend** — no UI existed to wire; surfaces via the composed
  endpoint. `ReviewsDisputes.tsx` (publisher-facing, reviews + disputes) still
  untouched.
- **No reviewer-facing write UI** (Sprint 6) — essentially no reviewer frontend
  to reverse-engineer.
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
| 6 | Review slice: GET/POST /versions/{id}/reviews + POST /reviews/{id}/retract, approved-reviewer gate, structural COI, append-only retraction, frontend reviewer notes | Complete with carryover | [SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md) |
| 7 | Dispute slice: 5 endpoints (file / list / get / respond / resolve), publisher-cannot-suppress enforced, terminal lifecycle, derived status, append-only — backend + tests only | Complete with carryover | [SPRINT_7_REPORT.md](sprints/SPRINT_7_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. 18 tables, **unchanged since
Sprint 1** (Sprint 4 added columns to `anchor_batches`; Sprints 5–7 added no
schema at all — each built against Sprint 1 tables that already fit).

```
Account ──has role──> reader | publisher | reviewer | admin
  (mirrors a Clerk user; role now also carried on the request Actor — only
   dispute:resolve reads it, to let a site admin close a stuck dispute)

Publisher ──mirrors──> Clerk Organization
Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership, also the
                                                            reviewer-COI join table —
                                                            a members row for the
                                                            publisher blocks review:create
                                                            and dispute:file]
Publisher (1) ──has──> (N) CredibilityScoreHistory point
Publisher (1) ──publishes──> (N) Article

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained]
ArticleVersion (1) ──has──> (N) Evidence          [binds to version; draft-only attach,
                                                    then frozen; bytes SHA-256'd +
                                                    content-addressed; tag=source
                                                    fetched+snapshotted]
ArticleVersion (1) ──has──> (1) AnchorRecord      [pending/anchored/anchor_failed]
ArticleVersion (1) ──has──> (0..1) Redaction      [public tombstone, if redacted]
ArticleVersion (1) ──has──> (N) Review            [append-only; non-draft version, by an
                                                    approved non-affiliated reviewer;
                                                    retraction = a ReviewRetraction row]
ArticleVersion (1) ──has──> (N) Dispute           [own entity; filed by an approved
                                                    non-affiliated reviewer against a
                                                    non-draft version; append-only;
                                                    publisher can only append a
                                                    publisher_responded event]
Dispute        (1) ──has──> (N) DisputeEvent      [append-only lifecycle log; status =
                                                    latest event's type, or "open" if
                                                    none; withdrawn/resolved_* are
                                                    terminal — no further events]

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute

Account(reader) ──saves───> (N) SavedArticle ──> Article
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher

Publisher (1) ──has──> (N) ActivityEvent
AnchorBatch (1) ──has──> (N) AnchorRecord
```

TrustStatus (6 values: authentic, authentic_under_review, updated, disputed,
publisher_unverified, notfound) is **not a table** — computed at read time by
`GET /articles/{id}/verification`, per docs/DOMAIN.md #12. Still unbuilt, now
unblocked.

## Implemented endpoints

`packages/shared/openapi.json` defines the full contract (33 endpoints); 20 are
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
| GET | /versions/{versionId}/disputes | public | 7 |
| POST | /versions/{versionId}/disputes | Clerk bearer token | 7 |
| GET | /disputes/{disputeId} | public | 7 |
| POST | /disputes/{disputeId}/respond | Clerk bearer token | 7 |
| POST | /disputes/{disputeId}/resolve | Clerk bearer token | 7 |

## Decisions

- 2026-07-08 — Proposed Railway as the deployment target (Fly.io as documented
  fallback). Why: matches "prefer boring" for a monolith + worker + Postgres shape at
  year-one scale; rejected Vercel+Neon specifically because the durable anchoring
  worker doesn't fit a serverless function model. **Confirmed 2026-08-26.**
- 2026-07-08 — Proposed Clerk for auth. Why: its Organizations primitive maps directly
  onto Publisher orgs with member users; offloads credential/session security to a
  vendor. **Confirmed 2026-08-26.**
- 2026-07-08 — Decided to treat the frontend as a strong spec for Publisher and
  Reader/Verifier flows but not for Reviewer flows or most build-prompt invariants
  (disputes, redaction, anchor pending/failed states), since those have no frontend
  representation at all.
- 2026-08-26 — Anchor state: every version always shows an explicit
  pending/anchored/anchor_failed badge (`anchor_records.status`), never an
  optimistic "verified." Revisit: never. **Enforced in Sprint 4.**
- 2026-08-26 — Dispute is a separate entity (`disputes` + append-only
  `dispute_events`), not `Review{type:"dispute"}`, and a publisher may respond with
  free text and/or a correction version but never resolve, withdraw, or hide a
  dispute themselves. Revisit: never. **Enforced in Sprint 7: the publisher's only
  write is an appended `publisher_responded` event; `/resolve` and `/withdraw` deny
  publisher members; both reads are public and never suppressible.**
- 2026-08-26 — Credibility score v1 uses exactly the 3 factors the frontend shows
  (verified articles, disputed claims, transparent corrections); "anchoring
  discipline" and "evidence completeness" are deferred. Revisit: as a versioned
  formula change, not a silent addition.
- 2026-08-26 — Reviewer conflict-of-interest is enforced via `publisher_members`
  (structural org membership), not the free-text `affiliation` field. **Enforced in
  Sprint 6 (`review:create`) and Sprint 7 (`dispute:file`) — they share the gate.**
- 2026-08-26 — Redaction tombstones (`redactions` table) are fully public:
  category, position, hash, and timestamp visible to any reader; the legal
  `reason` is not in the public schema. Revisit: if a category must stay
  confidential in aggregate.
- 2026-08-26 — Publisher verification state machine: unverified → pending →
  verified, plus rejected, approved by an `admin`-role account. Reviewer approval
  mirrors it. **Confirmed 2026-08-26**: one `admin` role handles both queues.
- 2026-08-26 — Article review status (draft/pending_review/verified) and anchor
  status (pending/anchored/anchor_failed) are independent columns; `Disputed` is
  not a status, just "this version has an open dispute," computed from
  `disputes`/`dispute_events`. Revisit: never.
- 2026-08-26 — Reader-facing trust status has 6 values, not the 4 the frontend
  implements. Revisit: never without a design change.
- 2026-08-26 — Evidence with `tag=source` is fetched and hashed (archived) at
  attach time, not merely linked. **Implemented in Sprint 5 behind a
  `SourceArchiver` seam; only the in-memory fake ships.**
- 2026-08-26 — Reviewer approval has a real admin queue and `admin` role, not
  manual database edits. Revisit: never without a scope-reduction ask.
- 2026-08-26 — A publisher can archive an article at any lifecycle stage; a
  never-submitted draft version can be hard-deleted, enforced by
  `reject_non_draft_update_delete()`. Revisit: never.
- 2026-08-26 — Reviews may be publicly attributed by a pseudonym
  (`reviewers.pseudonym`, `useLegalName`); `accounts.fullName` is never exposed by
  any public schema. **Enforced in Sprint 6 (reviews) and Sprint 7 (disputes) —
  the shared `displayName` derivation never selects `fullName` into a response.**
- 2026-08-26 — `/simple-login` and `/reader-portal` are confirmed dead and slated
  for deletion. **Not yet executed.**
- 2026-08-26 — `/article-edit-history`'s version-history data gets a second,
  public route (`GET /articles/{id}/versions`, `.../versions/{versionId}`)
  alongside the authenticated publisher route. Revisit: never.
- 2026-08-26 — Schema entity names confirmed at the Sprint 1 stop point — no renames.
- 2026-08-26 — Session auth is a Clerk-issued JWT as `Authorization: Bearer`,
  verified with `@clerk/backend`'s `verifyToken`. Revisit: never without dropping
  Clerk.
- 2026-08-26 — `apps/api`'s Fastify instance takes an injectable
  `SessionVerifier`; the database is never substituted — Testcontainers Postgres,
  real migrations, always.
- 2026-08-27 — `packages/anchoring`'s canonicalization/hashing spec is frozen
  (`docs/CANONICALIZATION.md`): SHA-256 over a key-sorted JSON serialization of
  exactly 8 version-content fields, via Web Crypto. Revisit: never without a new
  spec version.
- 2026-08-27 — `apps/api` gets CORS via `@fastify/cors`, origin from
  `CORS_ORIGIN`. Revisit: set it explicitly before any non-dev deployment.
- 2026-08-27 — `apps/web`'s auth UI handles Clerk's `needs_second_factor` inline
  in `LoginForm`. Revisit: never unless Clerk's 2FA strategy set changes.
- 2026-09-08 — Merkle anchoring spec frozen (`docs/ANCHORING.md`): leaf =
  `SHA-256(0x00 ‖ contentHashBytes)`, node = `SHA-256(0x01 ‖ left ‖ right)`,
  lonely node promoted, proof entries `{hash, side}` leaf→root, leaf order
  `(created_at, article_version_id)`. Revisit: never without a new spec version.
- 2026-09-08 — Anchoring runs in a **separate `apps/worker` process**. Revisit:
  if one-process simplicity ever outweighs the isolation.
- 2026-09-08 — A batch whose chain submit/confirm keeps failing retries with
  exponential backoff and, after `ANCHOR_MAX_ATTEMPTS` (default 5), goes terminal
  `anchor_failed`. Recovering one needs a future admin re-queue endpoint.
- 2026-09-08 — Sprint 4 ships only `createFakeAnchorProvider`. A real provider
  plugs in at the `AnchorProvider` interface with no worker or schema change.
- 2026-09-08 — `anchorRecordSchema` amended on implementation: `merkleProof` is
  `{hash, side}[]`; leaf field renamed `contentHash`; `merkleRoot` + `chainTxHash`
  added from the batch. Revisit: never without a contract change.
- 2026-09-08 — `confirmBatch` falls back to `provider.submit()` when
  `getReceipt()` throws, so a `submitted` batch is always drivable to completion
  from the persisted root alone.
- 2026-09-09 — `POST /versions/{versionId}/evidence` is `multipart/form-data`,
  amending the Sprint 1 `application/json` shape. `UploadEvidenceMultipart` adds
  the binary `file` part (absent for `tag=source`). Revisit: never without a
  contract change.
- 2026-09-09 — Object storage and source-URL archival sit behind injectable
  `ObjectStore` / `SourceArchiver` seams in `apps/api`, with only
  in-memory/deterministic fakes shipped. A real store and a guarded server-side
  fetch plug in with no service or route change; the real fetch is a Phase 5
  threat-pass concern.
- 2026-09-09 — Evidence attaches only while the owning version is a draft; once
  it leaves draft the set is frozen (409), and `evidence` rows are append-only.
  Revisit: never without a change to what append-only protects.
- 2026-09-09 — The list endpoints for evidence, reviews, and disputes
  keyset-paginate on the row `id`, not `created_at` — Postgres `timestamptz` is
  microsecond, a JS `Date`/ISO string is millisecond, so a `created_at` cursor
  re-serves same-millisecond rows (a real test caught this). Order within a
  version's evidence/reviews/disputes is a flat list, so `id` order costs
  nothing. Revisit: if a guaranteed chronological read is ever needed, use a
  full-precision composite cursor.
- 2026-09-09 — `POST /versions/{versionId}/reviews` requires a non-draft version
  and an `approved` reviewer who is not a `publisher_members` row for the
  publisher (`can`: `review:create`), with a denial message that names the rule
  but never the caller's affiliation. `POST /reviews/{reviewId}/retract` is
  author-only and models retraction as an append-only `review_retractions` row
  (UNIQUE `review_id` → second retract is 409); `isRetracted` / `retractedReason`
  derived from a LEFT JOIN. `createAuthorization` gained a `reviewersRepo`
  parameter. Revisit: never without an invariant change.
- 2026-09-09 — Dispute slice (Sprint 7): `dispute:file` shares the
  `review:create` gate. `dispute:respond` = membership of the disputed publisher;
  it may only append a `publisher_responded` event, with a `correctionVersionId`
  validated to be a *published* version of the *disputed article* (400
  otherwise). `dispute:withdraw` = the filer alone (not even an admin);
  `dispute:resolve` = the filer or a `role === "admin"` account; never the
  publisher. A dispute is **terminal** after `withdrawn` / `resolved_corrected` /
  `resolved_addressed_no_verdict` — `/respond` and `/resolve` then 409. Status is
  the latest event's type or `"open"`. `Actor` gained a `role` field
  (`requireActor`/`resolveOptionalActor` set it from the account row). Confirmed
  with the user: backend + tests only, terminal lifecycle. Revisit: never
  without an invariant change.

## Open questions

None outstanding.

## Known debt and deviations

- **Docker is still never available in this environment**, across seven sprints.
  `docker compose up`, the Testcontainers test path, and CI have never actually
  run here. Everything that mattered (all 6 migrations, seed, all 20 endpoints,
  the worker's full pipeline, the frontend flow) was verified via a scratch
  `embedded-postgres` outside the repo, torn down after. On Windows, a killed
  `embedded-postgres` launcher can leave an orphaned `postgres.exe` holding the
  test port — use a fresh port/data dir, or kill the orphan by
  `Get-NetTCPConnection -LocalPort <port>`. What's left: confirm CI goes green on
  GitHub's runners once something is pushed, and confirm `docker compose up`.
- **CI has never run.** Unchanged — nothing pushed since Sprint 2 added the
  workflow. The new dispute suite and the Sprint 5 `@fastify/multipart`
  dependency are picked up by the root `lint`/`typecheck`/`test` scripts, but the
  workflow file itself still hasn't been reviewed for whether it runs them.
- **`GET /articles/{id}/verification` unbuilt** (now unblocked — Evidence,
  Review, Dispute all exist). It needs the credibility computation (the 3
  frontend-shown factors) and a written derivation for each of the 6 TrustStatus
  values. Until it lands, TrustSummaryCard and PublisherCredibility on
  `/verification-result` stay mock.
- **No dispute frontend**, and **`ReviewsDisputes.tsx` untouched.** No dispute UI
  existed to wire; disputes reach the frontend via the composed endpoint.
- **No reviewer-facing write UI** (Sprint 6). No reviewer frontend to
  reverse-engineer.
- **`Actor.role` is typed `string`, not the `account_role` enum**, to keep
  `can.ts` free of a `@sourceit/shared` type dependency. Only compared
  `=== "admin"`. Tighten if `role` grows more uses.
- **`dispute:file` and `review:create` share a switch `case` in `can`.** Correct
  and documented; a future divergence means splitting them.
- **Dispute withdrawal is filer-only, even for an admin.** Admins can resolve a
  stuck dispute, not withdraw it. Deliberate.
- **Evidence hashes are not anchored.** Files are hashed and stored but not fed
  into the Merkle tree — the worker batches version content hashes only.
- **No real `ObjectStore`**, **no endpoint to read a stored evidence blob**.
  In-memory fake only; "View File" on the verification page is inert.
- **No real `SourceArchiver`.** `createFakeSourceArchiver` does not touch the
  network. Repay with the Phase 5 threat pass.
- **Frontend evidence write path unwired.** `MediaEvidenceUpload.tsx` keeps
  files in local state and sends nothing.
- **`apps/api/src/repositories/articles.repository.ts` cursor pagination keys on
  a millisecond-truncated `created_at` ISO string** (`listPublishedVersions`,
  `listForPublisher`). Pre-existing; the evidence/review/dispute lists dodge it
  by keying on `id`. Repay when those endpoints are next touched.
- **`apps/api`'s error handler maps only `AppError` / `ZodError` / Fastify
  schema `validation` to the error envelope.** A `415` (body with no
  `Content-Type`) or a `413` (`@fastify/multipart` `fileSize` limit) becomes a
  generic `500`. No realistic client hits either.
- **No real `AnchorProvider`.** Fake only. Repay when deploying to a real chain.
- **No admin re-queue for `anchor_failed`.** Terminal since Sprint 4.
- **`RegisterForm.tsx` still unwired.** Needs local-account provisioning plus
  `POST /publishers` and `POST /reviewers/apply` handlers.
- **No backend search endpoint** — `VerificationHero`'s search/scan tabs,
  `RecentlyVerified`, `SavedArticles` still navigate to the param-less mock
  verification route.
- **`apps/web` has no `tsconfig.json`.** Pre-existing (Figma Make export).
  `vite build` is its only standing check.
- **`apps/worker` duplicates `apps/api`'s `startTestDb` helper and `db.ts` pool
  setup** (~30 lines). Repay by extracting a test-support package only if a third
  app needs it.
- **`docs/ANCHORING.md`'s leaf-order rule is enforced by an `ORDER BY`, not a
  constraint.**
- **The `TEST_DATABASE_URL` escape hatch is single-file-parallelism only.**
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, dead since
  Sprint 1.
- **Fixed but worth tracking:** Sprint 3's append-only trigger silently
  discarding every write, and `apps/api` having no CORS; Sprint 4's "crash
  between submit and confirm" wedge; Sprint 5's millisecond-truncated evidence
  cursor (same keying now used for reviews and disputes). Automated tests alone
  are not sufficient proof a sprint is done, but a test that models the ugly
  timing is what caught the cursor bug.

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
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 87/87 — verified (56 prior + 31 dispute)
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
`objectStore` / `sourceArchiver` in `buildApp`; unset, both default to the
in-memory / fake implementation.

Still not possible here: `docker compose up` specifically, or Testcontainers
(both need Docker).
