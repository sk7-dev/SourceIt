# SourceIt — Project State
**Last updated:** end of Sprint 11  ·  **Current phase:** Phase 4 (remaining slices) — Anchoring + Evidence + Review + Dispute + composed Verification + Admin queues + Account provisioning + Version verification complete, verified against a real Postgres

> **Sprint 11 is awaiting commit** — the working tree holds it. Commit plan is
> in [SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md) / the closing message.
> Sprints 9 and 10 were committed since the previous session (git log confirms).

## Resume here

**Version verification** is done (Sprint 11): `POST /versions/{id}/verify` runs
behind `requireActor`, gated by `version:verify` — an `approved` reviewer with
no `publisher_members` row for the article's publisher (the exact
`review:create` / `dispute:file` predicate). It records an **append-only
`version_verifications` row** (`article_version_id` UNIQUE → second verify is
`409`; FK to `reviewers`), never an `UPDATE` of `article_versions.review_status`
(which the append-only trigger forbids on a non-draft row anyway). No anchor
precondition — a `pending_review` version is verifiable regardless of anchor
state. `404` for an unknown or draft version (existence not leaked), `403`
affiliated / not approved, `401` no session. Response is
`versionVerificationSchema` — `verifiedBy` is the pseudonym-aware public
identity, `accounts.fullName` never exposed. No migration beyond `0006`; no
frontend (`ReviewerPortal.tsx` is a static stub, as in Sprints 6/7/9). See
[SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md).

`verified` is now a **read-time overlay**, not a stored column value.
`GET /articles/{id}/verification` and the credibility read call
`verificationRepo.findVerifiedVersionIds(...)` and report a version as
`verified` iff a `version_verifications` row exists (a pre-set
`review_status = 'verified'`, e.g. from the seed, is still honoured — the
overlay only ever *adds* `verified`). This is the same "computed at read time,
never stored" treatment as `trustStatus` / `credibilityScore`.

Before Sprint 11: **account provisioning** (Sprint 10) — `POST /publishers` and
`POST /reviewers/apply` behind `requireAuth`, lazy `accounts` materialization
keyed by the verified `clerkUserId`, placeholder `clerk_org_id`;
`RegisterForm.tsx` publisher + reviewer paths wired to Clerk `useSignUp`.
See [SPRINT_10_REPORT.md](sprints/SPRINT_10_REPORT.md).

Before Sprint 10: the two **admin decision queues** (Sprint 9) —
publisher-verification and reviewer-approval, gated by a single
`{ type: "admin" }` action. See [SPRINT_9_REPORT.md](sprints/SPRINT_9_REPORT.md).

**TrustStatus** precedence (confirmed 2026-09-09):
`notfound > disputed > publisher_unverified > authentic_under_review > updated >
authentic`; anchor state is a separate track and not an input. As of Sprint 11
all six values are reachable for API-created data: a first version verified by a
reviewer on a verified publisher with no open dispute resolves to `authentic`;
a verified version past v1.0 to `updated`. **Credibility** (confirmed
2026-09-09): `score = clamp(0..100, round(60 + 40·verifiedRatio −
35·openDisputeRatio + 10·correctionRatio))`,
`transparencyLevel = clamp(1..5, 1 + round(4·correctionRatio))`, ratios over the
publisher's published articles, `0 / 3` when it has none. As of Sprint 11
`verifiedRatio` is finally reachable (it was structurally 0 before). Computed at
read time in `apps/api/src/services/trust.ts`; the cached
`publishers.credibility_score` column and `credibility_score_history` table are
left for a future publisher-dashboard slice.

**Biggest current limitation:** the **redaction** slice is unbuilt — no
redaction rows, no redaction endpoint, so the `verification` response's
`redaction` field is wired but always `null`, and legal-takedown content-blanking
(a Phase 1 invariant) does not exist yet.

Still mock / unbuilt, deliberately or blocked, after Sprint 11:

- **Reader account provisioning unbuilt** — no endpoint; `RegisterForm`'s reader
  path is a local stub; readers get no `accounts` row. Blocks the reader-features
  slice (saved-articles, publisher-follows).
- **`redaction` always `null` in practice** — no redaction rows, no redaction
  endpoint; content-blanking for a redacted version is the unbuilt redaction
  slice. The verification field is wired and will populate when it lands.
- **No real Clerk Organization** — `publishers.clerk_org_id` is a generated
  `local_org_<uuid>` placeholder; `publisher_members` is our own table, not
  synced to Clerk. A real Organization create/sync plugs in at that column.
- **No "un-verify" / revocation of a `version_verifications` row** — a
  verification is permanent (append-only trigger). Recourse is a dispute (which
  outranks it) or a correction version (unverified until re-verified).
- **No verifier identity in the composed read** — `GET /articles/{id}/verification`
  reports *that* the current version is verified, not *who* / *when*. The row
  records author + timestamp; surfacing it is a small additive follow-up.
- **`ensureAccount` is first-writer-wins on `role`** — one `accounts` row, one
  role; a reviewer who later registers a publisher keeps role `reviewer`.
- **`reviewerSchema` in the approval queue is identity-free** — no applicant
  name/email, no `applicationReason`. Frozen Sprint 1 shape.
- **No dispute frontend** — surfaces only via the composed endpoint's inputs.
  `ReviewsDisputes.tsx` still untouched.
- **No reviewer-facing write UI** (Sprint 6) — `ReviewerPortal.tsx` is a stub;
  a reviewer files reviews / disputes / verifications via the raw endpoints.
- Carried from Sprint 5: evidence hashes not anchored; no real `ObjectStore` /
  `SourceArchiver` / evidence-blob-read endpoint; evidence frontend write path
  unwired.
- Carried from Sprint 4: no real chain `AnchorProvider` (fake only); no admin
  re-queue for `anchor_failed`.
- Carried longer: any backend search.

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
| 8 | Composed GET /articles/{id}/verification: article + version history + evidence + reviews + publisher + anchor + redaction + derived TrustStatus + trustSummary; read-time credibility formula; VerificationResult on one call, TrustSummaryCard + PublisherCredibility wired | Complete with carryover | [SPRINT_8_REPORT.md](sprints/SPRINT_8_REPORT.md) |
| 9 | Admin decision queues: GET/POST publisher-verification and reviewer-approval, single `admin` authz action, decisions recorded; backend + tests only | Complete with carryover | [SPRINT_9_REPORT.md](sprints/SPRINT_9_REPORT.md) |
| 10 | Account provisioning: POST /publishers + POST /reviewers/apply, lazy `accounts` materialization behind `requireAuth`, placeholder `clerk_org_id`, RegisterForm publisher+reviewer paths wired to Clerk `useSignUp` | Complete with carryover | [SPRINT_10_REPORT.md](sprints/SPRINT_10_REPORT.md) |
| 11 | Version-verification slice: POST /versions/{id}/verify, append-only `version_verifications` row, approved-non-affiliated-reviewer gate, `verified` derived at read time — unblocks `authentic`/`updated` TrustStatus; backend + tests only | Complete with carryover | [SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. **19 tables** — Sprint 11 added
`version_verifications` (the first schema change since Sprint 4's column
additions to `anchor_batches`; Sprints 5–10 added no schema at all).

TrustStatus and credibility are **computed at read time** by
`GET /articles/{id}/verification` (Sprint 8), never stored. As of Sprint 11
`verified` is also a read-time overlay: `article_versions.review_status` is never
written to `verified` by the API — a `version_verifications` row is the source,
and the composed read maps it onto `currentVersion` / `versionHistory` / the
`deriveTrustStatus` input.

```
Account ──has role──> reader | publisher | reviewer | admin

Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership, also the
                                                            reviewer-COI join table —
                                                            a members row for the
                                                            publisher blocks review:create,
                                                            dispute:file, and version:verify]
Publisher (1) ──publishes──> (N) Article

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained]
ArticleVersion (1) ──has──> (N) Evidence          [draft-only attach, then frozen]
ArticleVersion (1) ──has──> (1) AnchorRecord      [pending/anchored/anchor_failed]
ArticleVersion (1) ──has──> (0..1) Redaction      [public tombstone, if redacted]
ArticleVersion (1) ──has──> (N) Review            [append-only; retraction = a row]
ArticleVersion (1) ──has──> (0..1) VersionVerification   [append-only; one per version
                                                            (UNIQUE); by an approved
                                                            non-affiliated reviewer;
                                                            presence = "verified" in the
                                                            trust read]
ArticleVersion (1) ──has──> (N) Dispute           [own entity; append-only events;
                                                    publisher may only append a
                                                    publisher_responded event]
Dispute        (1) ──has──> (N) DisputeEvent      [status = latest event's type, or
                                                    "open"; withdrawn/resolved_* terminal]

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute | (N) VersionVerification

Account(reader) ──saves───> (N) SavedArticle ──> Article
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher

Publisher (1) ──has──> (N) ActivityEvent
AnchorBatch (1) ──has──> (N) AnchorRecord
```

TrustStatus (6 values: authentic, authentic_under_review, updated, disputed,
publisher_unverified, notfound) is **not a table** — computed at read time by
`GET /articles/{id}/verification`, per docs/DOMAIN.md #12. As of Sprint 11 every
value is reachable for API-created data.

## Implemented endpoints

`packages/shared/openapi.json` defines the full contract (34 endpoints); 28 are
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
| POST | /versions/{versionId}/verify | Clerk bearer token | 11 |
| GET | /versions/{versionId}/disputes | public | 7 |
| POST | /versions/{versionId}/disputes | Clerk bearer token | 7 |
| GET | /disputes/{disputeId} | public | 7 |
| POST | /disputes/{disputeId}/respond | Clerk bearer token | 7 |
| POST | /disputes/{disputeId}/resolve | Clerk bearer token | 7 |
| GET | /articles/{articleId}/verification | public | 8 |
| GET | /publishers/pending-verification | admin (Clerk bearer token) | 9 |
| POST | /publishers/{publisherId}/verification | admin (Clerk bearer token) | 9 |
| GET | /reviewers/pending | admin (Clerk bearer token) | 9 |
| POST | /reviewers/{reviewerId}/decision | admin (Clerk bearer token) | 9 |
| POST | /publishers | Clerk session (account materialized on first call) | 10 |
| POST | /reviewers/apply | Clerk session (account materialized on first call) | 10 |

## Decisions

- 2026-07-08 — Railway as deployment target (Fly.io fallback). **Confirmed 2026-08-26.**
- 2026-07-08 — Clerk for auth. **Confirmed 2026-08-26.**
- 2026-07-08 — Frontend is a strong spec for Publisher and Reader/Verifier flows
  but not for Reviewer flows or most build-prompt invariants.
- 2026-08-26 — Anchor state always shows an explicit pending/anchored/anchor_failed
  badge, never an optimistic "verified." **Enforced in Sprint 4.**
- 2026-08-26 — Dispute is a separate entity; a publisher may respond but never
  resolve/withdraw/hide. **Enforced in Sprint 7.**
- 2026-08-26 — Credibility score v1 uses exactly the 3 factors the frontend shows.
  Revisit: as a versioned formula change.
- 2026-08-26 — Reviewer conflict-of-interest is enforced via `publisher_members`
  (structural), not the free-text `affiliation`. **Enforced in Sprint 6
  (`review:create`), Sprint 7 (`dispute:file`), and Sprint 11 (`version:verify`)
  — all three share the gate.**
- 2026-08-26 — Redaction tombstones are fully public (category, position, hash,
  timestamp); the legal `reason` is not in the public schema.
- 2026-08-26 — Publisher verification: unverified → pending → verified, plus
  rejected, by an `admin` account. Reviewer approval mirrors it. One `admin` role
  handles both queues.
- 2026-08-26 — Article review status and anchor status are independent columns;
  `Disputed` is not a status, just "this version has an open dispute."
- 2026-08-26 — Reader-facing trust status has 6 values, not the 4 the frontend
  implements.
- 2026-08-26 — Evidence with `tag=source` is fetched and hashed at attach time.
  **Implemented in Sprint 5 behind a `SourceArchiver` seam; in-memory fake only.**
- 2026-08-26 — Reviewer approval has a real admin queue and `admin` role.
- 2026-08-26 — A publisher can archive at any stage; a never-submitted draft can
  be hard-deleted.
- 2026-08-26 — Reviews may be publicly attributed by pseudonym; `accounts.fullName`
  is never exposed by any public schema. **Extended in Sprint 11:
  `version_verifications`' `verifiedBy` uses the same `displayName` derivation.**
- 2026-08-26 — `/simple-login` and `/reader-portal` are confirmed dead. **Not yet
  executed.**
- 2026-08-26 — `/article-edit-history`'s version-history data also gets public
  routes.
- 2026-08-26 — Schema entity names confirmed at the Sprint 1 stop point — no renames.
- 2026-08-26 — Session auth is a Clerk-issued JWT as `Authorization: Bearer`,
  verified with `@clerk/backend`'s `verifyToken`.
- 2026-08-26 — `apps/api`'s Fastify instance takes an injectable `SessionVerifier`;
  the database is never substituted — Testcontainers Postgres, real migrations.
- 2026-08-27 — `packages/anchoring`'s canonicalization/hashing spec is frozen
  (`docs/CANONICALIZATION.md`).
- 2026-08-27 — `apps/api` gets CORS via `@fastify/cors`, origin from `CORS_ORIGIN`.
- 2026-08-27 — `apps/web`'s auth UI handles Clerk's `needs_second_factor` inline
  in `LoginForm`.
- 2026-09-08 — Merkle anchoring spec frozen (`docs/ANCHORING.md`).
- 2026-09-08 — Anchoring runs in a separate `apps/worker` process.
- 2026-09-08 — A batch whose chain submit/confirm keeps failing retries with
  exponential backoff and, after `ANCHOR_MAX_ATTEMPTS` (default 5), goes terminal
  `anchor_failed`.
- 2026-09-08 — Sprint 4 ships only `createFakeAnchorProvider`.
- 2026-09-08 — `anchorRecordSchema` amended on implementation: `merkleProof` is
  `{hash, side}[]`; leaf field `contentHash`; `merkleRoot` + `chainTxHash` added.
- 2026-09-08 — `confirmBatch` falls back to `provider.submit()` when `getReceipt()`
  throws.
- 2026-09-09 — `POST /versions/{versionId}/evidence` is `multipart/form-data`.
- 2026-09-09 — Object storage and source-URL archival sit behind injectable
  `ObjectStore` / `SourceArchiver` seams; only fakes shipped.
- 2026-09-09 — Evidence attaches only while the owning version is a draft; once it
  leaves draft the set is frozen (409); `evidence` rows are append-only.
- 2026-09-09 — The list endpoints for evidence, reviews, and disputes
  keyset-paginate on the row `id`, not `created_at` (microsecond vs millisecond).
- 2026-09-09 — `POST /versions/{versionId}/reviews` requires a non-draft version
  and an `approved` non-affiliated reviewer (`review:create`). Retraction is an
  append-only `review_retractions` row (UNIQUE `review_id` → second retract 409).
- 2026-09-09 — Dispute slice (Sprint 7): `dispute:file` shares the `review:create`
  gate; `dispute:respond` = membership; `dispute:withdraw` = the filer alone;
  `dispute:resolve` = the filer or a `role === "admin"` account. Terminal after
  `withdrawn` / `resolved_*`. Status is the latest event's type or `"open"`.
- 2026-09-09 — `GET /articles/{id}/verification` (Sprint 8): TrustStatus derived
  at read time with precedence `notfound > disputed > publisher_unverified >
  authentic_under_review > updated > authentic`; anchor state is not an input.
  404 body is `{ trustStatus: "notfound", queriedId? }`.
- 2026-09-09 — Credibility score computed at read time from the 3 confirmed
  factors; cached column / history table not written (deferred to a dashboard
  slice).
- 2026-09-09 — `VerificationResult.tsx` makes a single
  `GET /articles/{id}/verification` call; five service mappers exported for reuse.
- 2026-09-09 — Admin queues (Sprint 9): a single `{ type: "admin" }` action gates
  all four; decisions record author + timestamp, permissive on current state,
  `404` only an unknown id.
- 2026-09-09 — Account provisioning (Sprint 10): `POST /publishers` and
  `POST /reviewers/apply` behind `requireAuth`; lazy `ensureAccount` keyed by the
  verified `clerkUserId`, identity from the body, `role` from the endpoint,
  first-writer-wins. `publishers.clerk_org_id` is a `local_org_<uuid>`
  placeholder. A person may own many publishers; one reviewer profile per account.
- 2026-09-10 — Version verification (Sprint 11): `POST /versions/{id}/verify`
  gated by `version:verify` = the `review:create` predicate (approved reviewer,
  no `publisher_members` row). Modeled as an **append-only `version_verifications`
  row** (`article_version_id` UNIQUE → repeat is `409`; FK to `reviewers`), never
  an `UPDATE` of `article_versions.review_status`. **No anchor precondition.**
  `verified` is derived at read time — the composed verification read and
  `creditAggregate` overlay it via `findVerifiedVersionIds`; a pre-set
  `review_status = 'verified'` is still honoured but the API never writes it. No
  un-verify (append-only). Verifier identity is recorded on the row but not yet
  surfaced in the composed read. Confirmed with the user. Revisit: revocation
  workflow, or making the column authoritative again (needs its own
  trigger/schema decision).

## Open questions

- *(none ranked as blocking)*. The Sprint 8–10 carry-forward — "how does a
  version reach `verified`?" — was **answered in Sprint 11**: an approved
  non-affiliated reviewer posts an append-only `version_verifications` row via
  `POST /versions/{id}/verify`; `verified` is then derived at read time.

## Known debt and deviations

- **Docker is still never available in this environment**, across eleven
  sprints. Sprint 11 additionally found the `embedded-postgres` prebuilt Windows
  binaries will not execute from the OS temp directory (`STATUS_DLL_INIT_FAILED`
  — a path-based execution policy); copied to a non-temp path (`D:\…`) they run
  normally. Everything that mattered this sprint (all 7 migrations, seed, 185
  workspace tests, the append-only trigger and constraints inspected in the live
  catalog) was verified against a real PostgreSQL 16.14 driven directly from
  `initdb` / `pg_ctl` on a non-temp path, torn down afterward (no process holds
  port 55432). What's left: confirm CI goes green on GitHub's runners once
  something is pushed, and confirm `docker compose up`.
- **CI has never run.** Nothing pushed since Sprint 2 added the workflow. The
  dispute + verification + admin + registration + version-verification suites are
  picked up by the root `lint`/`typecheck`/`test` scripts, but the workflow file
  itself still hasn't been reviewed for whether it runs them. **Sprint 11 is
  awaiting commit** (Sprints 9 and 10 were committed since the previous session).
- **Drizzle snapshot drift for the anchoring status indexes is two migrations
  deep.** `schema/anchoring.ts` does not define `anchor_records_status_idx` /
  `anchor_batches_status_idx` (0005 added them as hand-written SQL), so every
  `drizzle-kit generate` wants to `DROP` them; the Sprint 11 `0006` migration
  had those spurious lines removed by hand. Repay by adding the two indexes to
  the Drizzle schema the next time the anchoring schema is touched.
- **`article_versions.review_status = 'verified'` is dead as an API outcome**
  after Sprint 11 (still a valid enum value, still honoured by the read overlay
  if present). Making the column authoritative again needs its own
  trigger/schema decision.
- **No verifier identity in the composed verification read** — the
  `version_verifications` row records `reviewer_id` + `created_at` but
  `GET /articles/{id}/verification` reports only that the current version is
  `verified`. Small additive follow-up.
- **`RegisterForm.tsx` is wired but not integration-tested** — driving Clerk's
  headless `useSignUp` needs a live Clerk project.
- **`reviewerSchema` in `GET /reviewers/pending` has no applicant identity or
  `applicationReason`.** Frozen Sprint 1 shape.
- **Admin decision endpoints don't reject a no-op.** Idempotent-ish by design.
- **`GET /articles/{id}/verification` `redaction` is always `null`** — no
  redaction rows, no redaction endpoint. Field is wired.
- **`registryMember` / `versionMatch` trustSummary facts are `true` on every
  200** — a served published version *is* the registered record.
- **Version-scoped `evidence` / `reviews` in the verification response are
  fetched with `LIMIT 1000`** — fine at year-one volume.
- **No dispute frontend**, and **`ReviewsDisputes.tsx` untouched.**
- **`PublisherCredibility.tsx`'s "Correction History" box keeps its mock counts
  for the no-`articleId` fallback.**
- **No reviewer-facing write UI** (Sprint 6). `ReviewerPortal.tsx` is a stub.
- **`Actor.role` is typed `string`, not the `account_role` enum** — only compared
  `=== "admin"`.
- **`dispute:file`, `review:create`, and `version:verify` share a switch `case`
  in `can`.** Correct and documented; a future divergence means splitting them.
- **Dispute withdrawal is filer-only, even for an admin.** Deliberate.
- **Evidence hashes are not anchored.**
- **No real `ObjectStore`**, **no endpoint to read a stored evidence blob**.
- **No real `SourceArchiver`.** `createFakeSourceArchiver` does not touch the
  network. Repay with the Phase 5 threat pass.
- **Frontend evidence write path unwired.** `MediaEvidenceUpload.tsx` sends
  nothing.
- **`apps/api/src/repositories/articles.repository.ts` cursor pagination keys on
  a millisecond-truncated `created_at` ISO string** (`listPublishedVersions`,
  `listForPublisher`). Pre-existing; the evidence/review/dispute/verification
  lists dodge it by keying on `id`.
- **`apps/api`'s error handler maps only `AppError` / `ZodError` / Fastify schema
  `validation`** — a `415` / `413` becomes a generic `500`.
- **No real `AnchorProvider`.** Fake only.
- **No admin re-queue for `anchor_failed`.** Terminal since Sprint 4.
- **`RegisterForm.tsx`'s reader path still unwired** — needs reader account
  provisioning.
- **No backend search endpoint** — `VerificationHero`'s search/scan tabs,
  `RecentlyVerified`, `SavedArticles` still navigate to the param-less mock route.
- **`apps/web` has no `tsconfig.json`.** Pre-existing (Figma Make export).
  `vite build` is its only standing check.
- **`apps/worker` duplicates `apps/api`'s `startTestDb` helper and `db.ts` pool
  setup** (~30 lines).
- **`docs/ANCHORING.md`'s leaf-order rule is enforced by an `ORDER BY`, not a
  constraint.**
- **The `TEST_DATABASE_URL` escape hatch is single-file-parallelism only.**
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, dead since
  Sprint 1.

## How to run

Confirmed working this sprint (against a real PostgreSQL 16.14 via
`initdb`/`pg_ctl` on a non-temp path — Docker unavailable, and
`embedded-postgres` binaries blocked from `%TEMP%`; `apps/web` via `vite build`):

```
pnpm install                                   # workspace install
pnpm typecheck                                 # apps/api + apps/worker + packages/shared + packages/anchoring — 0 errors
pnpm lint                                      # same four — 0 errors/warnings
pnpm --filter @sourceit/shared db:migrate      # applies all 7 migrations (0000–0006) for real — verified
pnpm --filter @sourceit/shared seed            # verified against a real database (adds 1 version_verifications row)
pnpm --filter @sourceit/anchoring test         # 33/33 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 145/145 — verified (132 prior + 13 version-verification)
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/worker exec vitest run                        # 7/7 — verified
pnpm --filter @sourceit/shared openapi:generate && pnpm --filter @sourceit/shared client:generate  # regenerated, not hand-edited
pnpm dev                                        # runs apps/api + apps/worker in parallel; both need ../../.env
pnpm --filter @sourceit/web dev                # needs apps/web/.env.local (VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL)
pnpm --filter @sourceit/web build              # 2204 modules — verified
```

`.env` for `pnpm dev`: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `CORS_ORIGIN` (api); the worker reads the same file and
takes optional `ANCHOR_TICK_MS` / `ANCHOR_MAX_BATCH` / `ANCHOR_MAX_ATTEMPTS` /
`FAKE_ANCHOR_CONFIRMATIONS`. `apps/api` also accepts injected `objectStore` /
`sourceArchiver` in `buildApp`; unset, both default to the in-memory / fake
implementation.

Still not possible here: `docker compose up` specifically, or Testcontainers
(both need Docker). On Windows, prefer a Postgres install outside
`%LOCALAPPDATA%\Temp` — binaries under the temp tree are execution-blocked on
this host. A killed launcher can leave an orphaned `postgres.exe` on the test
port — check with `Get-NetTCPConnection -LocalPort <port>`.
