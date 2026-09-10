# SourceIt — Project State
**Last updated:** end of Sprint 13  ·  **Current phase:** Phase 4 (remaining slices) — one slice left: publisher-dashboard reads

> **Sprint 13 is awaiting commit** — the working tree holds it. Commit plan is
> in the closing message. Sprint 12 was committed (git log confirms).

## Resume here

**Reader features** are done (Sprint 13). `POST /readers` (Clerk session,
mirrors Sprint 10's `POST /publishers`) lazily materializes the caller's
`accounts` row with `role = 'reader'`, keyed by the verified `clerkUserId`,
idempotent; `409` on an email already on a different Clerk user. The six
per-reader endpoints (`requireActor`) are now live:

- `GET`/`POST /saved-articles`, `DELETE /saved-articles/{savedArticleId}`
- `GET`/`POST /publisher-follows`, `DELETE /publisher-follows/{followId}`

Lists are cursor-paginated on the row `id`. The saved list is denormalized to
`{ id, articleId, title, publisherName, trustStatus, savedAt }` — `trustStatus`
is the **same six-value read-time derivation** as
`GET /articles/{id}/verification`, batched over the page (current versions +
open-dispute ids + verified ids + redaction map, one query each — no N+1). A
redacted current version → `title: ""`. The follow list carries `verified` and a
read-time `credibilityScore` (looped per publisher). `409` on a repeat
save/follow; `403` on deleting another reader's row; `404` for an unknown /
archived / draft-only article on `POST /saved-articles`. `RegisterForm.tsx`'s
reader path is wired to Clerk `useSignUp` + `POST /readers` — all three roles
now register for real. `SavedArticles.tsx` / `TrustedPublishers.tsx` stay on
mock data (their mock shapes carry fields the contract does not; wiring needs
component restructuring the build prompt forbids). No migration. See
[SPRINT_13_REPORT.md](sprints/SPRINT_13_REPORT.md).

Before Sprint 13: **redaction** (Sprint 12) — `GET`/`POST /versions/{id}/redaction`,
admin-only, append-only tombstone (`0007` trigger), read-layer content
suppression on the public version reads, `tombstoneHash` = `contentHash`. See
[SPRINT_12_REPORT.md](sprints/SPRINT_12_REPORT.md).

Before Sprint 12: **version verification** (Sprint 11) — `POST /versions/{id}/verify`,
append-only `version_verifications` row, `verified` derived at read time.

**TrustStatus** precedence (confirmed 2026-09-09):
`notfound > disputed > publisher_unverified > authentic_under_review > updated >
authentic`; anchor state and redaction are separate tracks, not inputs. All six
values reachable for API-created data. **Credibility** (confirmed 2026-09-09):
`score = clamp(0..100, round(60 + 40·verifiedRatio − 35·openDisputeRatio +
10·correctionRatio))`, `transparencyLevel = clamp(1..5, 1 +
round(4·correctionRatio))`, over the publisher's published articles, `0 / 3`
when none. Computed at read time in `apps/api/src/services/trust.ts`; the cached
`publishers.credibility_score` column and `credibility_score_history` table
remain unwritten (publisher-dashboard slice).

**Biggest current gap:** **one Phase 4 slice remains — publisher-dashboard
reads** (`GET /publishers/{id}`, `/analytics`, `/activity`, `/credibility`,
`/credibility-history`, `/reviews`) — and **nothing has been pushed since Sprint
2, so CI and `docker compose up` have never actually run.**

Still mock / unbuilt, deliberately or blocked, after Sprint 13:

- **Publisher-dashboard reads unbuilt** — the six `GET /publishers/{id}/*`
  operations are declared in `openapi.json` but not implemented; the cached
  `credibility_score` column and `credibility_score_history` table are still
  never written. This is the last Phase 4 slice.
- **`SavedArticles.tsx` / `TrustedPublishers.tsx` still run on mock data** —
  their hardcoded arrays carry `trustScore` (number), `tags`, `lastChecked`,
  `categories`, `transparencyLevel`, none of which the Sprint 1 contract
  provides; wiring needs component restructuring the build prompt forbids. Also
  mock: `RecentlyVerified.tsx`, `UserStats.tsx` (need a search / stats
  endpoint that does not exist).
- **`GET /publishers/{id}/articles` is not redaction-suppressed** — the
  authenticated owner dashboard list still shows a redacted article's headline.
- **`changeSummary` is not blanked on a redacted version.**
- **Redaction is irreversible**; **no "un-verify"** of a `version_verifications`
  row.
- **No real Clerk Organization** — `publishers.clerk_org_id` is a
  `local_org_<uuid>` placeholder.
- **`ensureAccount` is first-writer-wins on `role`** — one `accounts` row, one
  role.
- **`reviewerSchema` in the approval queue is identity-free.**
- **No dispute frontend**; `ReviewsDisputes.tsx` untouched.
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
| 0 | Discovery — domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |
| 3 | Article vertical slice: full backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |
| 4 | Anchoring slice: Merkle tree + proof + AnchorProvider, durable crash-safe worker, GET /versions/{id}/anchor, frontend anchor state | Complete with carryover | [SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md) |
| 5 | Evidence slice: multipart POST + public GET /versions/{id}/evidence, content-addressed ObjectStore + SourceArchiver seams (fakes), append-only, frontend evidence list | Complete with carryover | [SPRINT_5_REPORT.md](sprints/SPRINT_5_REPORT.md) |
| 6 | Review slice: GET/POST /versions/{id}/reviews + POST /reviews/{id}/retract, approved-reviewer gate, structural COI, append-only retraction, frontend reviewer notes | Complete with carryover | [SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md) |
| 7 | Dispute slice: 5 endpoints, publisher-cannot-suppress enforced, terminal lifecycle, derived status, append-only — backend + tests only | Complete with carryover | [SPRINT_7_REPORT.md](sprints/SPRINT_7_REPORT.md) |
| 8 | Composed GET /articles/{id}/verification: version history + evidence + reviews + publisher + anchor + redaction + derived TrustStatus + trustSummary; read-time credibility; VerificationResult on one call | Complete with carryover | [SPRINT_8_REPORT.md](sprints/SPRINT_8_REPORT.md) |
| 9 | Admin decision queues: GET/POST publisher-verification and reviewer-approval, single `admin` authz action; backend + tests only | Complete with carryover | [SPRINT_9_REPORT.md](sprints/SPRINT_9_REPORT.md) |
| 10 | Account provisioning: POST /publishers + POST /reviewers/apply, lazy `accounts` materialization behind `requireAuth`, RegisterForm publisher+reviewer paths wired | Complete with carryover | [SPRINT_10_REPORT.md](sprints/SPRINT_10_REPORT.md) |
| 11 | Version-verification slice: POST /versions/{id}/verify, append-only `version_verifications` row, `verified` derived at read time — unblocks authentic/updated TrustStatus; backend + tests only | Complete with carryover | [SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md) |
| 12 | Redaction slice: GET/POST /versions/{id}/redaction, admin-only, append-only tombstone (0007 trigger), read-layer content suppression, tombstoneHash = contentHash; backend + tests only | Complete with carryover | [SPRINT_12_REPORT.md](sprints/SPRINT_12_REPORT.md) |
| 13 | Reader-features slice: POST /readers + six saved-article/publisher-follow endpoints, batched read-time trustStatus in the saved list, RegisterForm reader path wired | Complete with carryover | [SPRINT_13_REPORT.md](sprints/SPRINT_13_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. **19 tables** — unchanged since
Sprint 11 added `version_verifications` (Sprint 12 added a trigger to
`redactions`; Sprint 13 added no schema).

TrustStatus, credibility, and `verified` are computed at read time, never
stored. Redaction is read-layer suppression (`toApiVersion` nulls the content
fields when a `redactions` row is present).

```
Account ──has role──> reader | publisher | reviewer | admin

Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership, also the
                                                            reviewer-COI join table]
Publisher (1) ──publishes──> (N) Article

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained]
ArticleVersion (1) ──has──> (N) Evidence           [draft-only attach, then frozen]
ArticleVersion (1) ──has──> (1) AnchorRecord       [pending/anchored/anchor_failed]
ArticleVersion (1) ──has──> (0..1) Redaction       [append-only tombstone (0001+0007);
                                                     admin-only; blanks the version's
                                                     content at the read layer]
ArticleVersion (1) ──has──> (N) Review             [append-only; retraction = a row]
ArticleVersion (1) ──has──> (0..1) VersionVerification  [append-only; one per version;
                                                          presence = "verified"]
ArticleVersion (1) ──has──> (N) Dispute            [own entity; append-only events]
Dispute        (1) ──has──> (N) DisputeEvent

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute | (N) VersionVerification

Account(reader) ──saves───> (N) SavedArticle ──> Article        [Sprint 13; (account,article) UNIQUE]
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher   [Sprint 13; (account,publisher) UNIQUE]

Publisher (1) ──has──> (N) ActivityEvent
AnchorBatch (1) ──has──> (N) AnchorRecord
```

## Implemented endpoints

`packages/shared/openapi.json` defines the full contract — **35 paths / 44
operations; 38 implemented**, all verified against a real database. The 6
unimplemented are the publisher-dashboard reads. `GET /healthz` / `GET /readyz`
also exist but are intentionally not in `openapi.json`.

| Method | Path | Auth | Sprint |
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
| GET | /versions/{versionId}/redaction | public | 12 |
| POST | /versions/{versionId}/redaction | admin (Clerk bearer token) | 12 |
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
| POST | /publishers | Clerk session (account materialized) | 10 |
| POST | /reviewers/apply | Clerk session (account materialized) | 10 |
| POST | /readers | Clerk session (account materialized) | 13 |
| GET | /saved-articles | reader (Clerk bearer token) | 13 |
| POST | /saved-articles | reader (Clerk bearer token) | 13 |
| DELETE | /saved-articles/{savedArticleId} | reader (Clerk bearer token) | 13 |
| GET | /publisher-follows | reader (Clerk bearer token) | 13 |
| POST | /publisher-follows | reader (Clerk bearer token) | 13 |
| DELETE | /publisher-follows/{followId} | reader (Clerk bearer token) | 13 |

**Declared but not implemented:** `GET /publishers/{publisherId}`,
`/analytics`, `/activity`, `/credibility`, `/credibility-history`, `/reviews`
(the publisher-dashboard slice).

## Decisions

- 2026-07-08 — Railway as deployment target (Fly.io fallback). **Confirmed 2026-08-26.**
- 2026-07-08 — Clerk for auth. **Confirmed 2026-08-26.**
- 2026-07-08 — Frontend is a strong spec for Publisher and Reader/Verifier flows,
  not for Reviewer flows or most invariants.
- 2026-08-26 — Anchor state always shows an explicit badge, never an optimistic
  "verified." **Enforced in Sprint 4.**
- 2026-08-26 — Dispute is a separate entity; a publisher may respond but never
  resolve/withdraw/hide. **Enforced in Sprint 7.**
- 2026-08-26 — Credibility score v1 uses exactly the 3 factors the frontend
  shows. Revisit: as a versioned formula change.
- 2026-08-26 — Reviewer conflict-of-interest is enforced via `publisher_members`
  (structural). **Enforced in Sprints 6 / 7 / 11 — all share the gate.**
- 2026-08-26 — Redaction tombstones are fully public; the legal `reason` is not
  in the public schema. **Enforced in Sprint 12: no endpoint returns `reason`.**
- 2026-08-26 — Publisher verification: unverified → pending → verified, plus
  rejected, by an `admin` account. One `admin` role handles both queues.
- 2026-08-26 — Article review status and anchor status are independent columns.
- 2026-08-26 — Reader-facing trust status has 6 values, not the 4 the frontend
  implements.
- 2026-08-26 — Evidence with `tag=source` is fetched and hashed at attach time
  (behind a `SourceArchiver` seam; fake only).
- 2026-08-26 — Reviewer approval has a real admin queue and `admin` role.
- 2026-08-26 — A publisher can archive at any stage; a never-submitted draft can
  be hard-deleted.
- 2026-08-26 — Reviews may be publicly attributed by pseudonym; `accounts.fullName`
  is never exposed by any public schema. **Extended in Sprint 11 for
  `version_verifications`' `verifiedBy`.**
- 2026-08-26 — `/simple-login` and `/reader-portal` are confirmed dead. **Not
  yet executed.**
- 2026-08-26 — `/article-edit-history`'s version-history data also gets public
  routes.
- 2026-08-26 — Schema entity names confirmed at the Sprint 1 stop point — no
  renames.
- 2026-08-26 — Session auth is a Clerk-issued JWT as `Authorization: Bearer`,
  verified with `@clerk/backend`'s `verifyToken`.
- 2026-08-26 — `apps/api`'s Fastify instance takes an injectable
  `SessionVerifier`; the database is never substituted — real Postgres, real
  migrations.
- 2026-08-27 — `packages/anchoring`'s canonicalization/hashing spec is frozen.
- 2026-08-27 — `apps/api` gets CORS via `@fastify/cors`, origin from
  `CORS_ORIGIN`.
- 2026-08-27 — `apps/web`'s auth UI handles Clerk's `needs_second_factor` inline
  in `LoginForm`.
- 2026-09-08 — Merkle anchoring spec frozen (`docs/ANCHORING.md`).
- 2026-09-08 — Anchoring runs in a separate `apps/worker` process.
- 2026-09-08 — A failing anchor batch retries with backoff and, after
  `ANCHOR_MAX_ATTEMPTS` (default 5), goes terminal `anchor_failed`.
- 2026-09-08 — Sprint 4 ships only `createFakeAnchorProvider`.
- 2026-09-08 — `anchorRecordSchema` amended on implementation.
- 2026-09-08 — `confirmBatch` falls back to `provider.submit()` when
  `getReceipt()` throws.
- 2026-09-09 — `POST /versions/{versionId}/evidence` is `multipart/form-data`.
- 2026-09-09 — Object storage and source-URL archival sit behind injectable
  `ObjectStore` / `SourceArchiver` seams; fakes only.
- 2026-09-09 — Evidence attaches only while the owning version is a draft; then
  frozen (409); `evidence` rows are append-only.
- 2026-09-09 — The evidence / review / dispute / saved-article / follow list
  endpoints keyset-paginate on the row `id`, not `created_at` (microsecond vs
  millisecond).
- 2026-09-09 — `POST /versions/{versionId}/reviews` requires a non-draft version
  and an `approved` non-affiliated reviewer. Retraction is an append-only
  `review_retractions` row (UNIQUE `review_id` → second retract 409).
- 2026-09-09 — Dispute slice (Sprint 7): `dispute:file` shares the
  `review:create` gate; `dispute:respond` = membership; `dispute:withdraw` = the
  filer alone; `dispute:resolve` = the filer or a `role === "admin"` account.
- 2026-09-09 — `GET /articles/{id}/verification` (Sprint 8): TrustStatus derived
  at read time with the confirmed precedence; anchor state is not an input. 404
  body is `{ trustStatus: "notfound", queriedId? }`.
- 2026-09-09 — Credibility score computed at read time; cached column / history
  table not written.
- 2026-09-09 — `VerificationResult.tsx` makes a single
  `GET /articles/{id}/verification` call.
- 2026-09-09 — Admin queues (Sprint 9): a single `{ type: "admin" }` action
  gates all four; decisions record author + timestamp, permissive on current
  state, `404` only an unknown id.
- 2026-09-09 — Account provisioning (Sprint 10): `POST /publishers` and
  `POST /reviewers/apply` behind `requireAuth`; lazy `ensureAccount` keyed by
  the verified `clerkUserId`, first-writer-wins; `publishers.clerk_org_id` is a
  placeholder.
- 2026-09-10 — Version verification (Sprint 11): `POST /versions/{id}/verify`
  gated by `version:verify` = the `review:create` predicate. Append-only
  `version_verifications` row, never an `UPDATE` of
  `article_versions.review_status`. No anchor precondition. `verified` derived
  at read time; a pre-set `review_status = 'verified'` is still honoured but the
  API never writes it. No un-verify.
- 2026-09-10 — Redaction (Sprint 12): `POST /versions/{id}/redaction` gated by
  `{ type: "admin" }`. Read-layer suppression only — `toApiVersion` nulls the
  content fields; the `article_versions` row is never modified. Applied on the
  public version reads. `tombstoneHash` = `contentHash`. Append-only (`0007`)
  and one-per-version → `409`; `404` a draft/unknown version; the legal
  `reason` is returned by no endpoint. `articleVersionSchema` content fields
  loosened to nullable + a `redaction` field added. Does not affect
  `trustStatus` / credibility, does not suppress evidence / reviews / anchor /
  disputes.
- 2026-09-10 — Reader features (Sprint 13): `POST /readers` mirrors Sprint 10
  (session-only, lazy `accounts` row, `role='reader'`, idempotent, `409`
  email-clash). The six per-reader endpoints run behind `requireActor`; lists
  keyset-paginate on the row `id`. The saved list's `trustStatus` is the
  six-value read-time derivation batched over the page (no N+1); a redacted
  current version → `title: ""`; a saved article later archived / draft-only
  drops from the list (bookmark row persists, deletable by id). The follow
  list's `credibilityScore` is the read-time formula looped per publisher.
  Re-save / re-follow → `409`; delete-not-owner → `403`. `POST /saved-articles`
  requires a published version (`404` otherwise). Frontend: `RegisterForm`
  reader path only; the two list screens stay on mock data (shape mismatch,
  no restructure). Confirmed with the user.

## Open questions

- *(none ranked as blocking)*.

## Known debt and deviations

- **Docker is still never available in this environment**, across thirteen
  sprints. The `embedded-postgres` prebuilt Windows binaries will not execute
  from the OS temp directory on this host (`STATUS_DLL_INIT_FAILED` — a
  path-based execution policy); copied to a non-temp path (`D:\…`) they run
  normally. Everything that mattered this sprint (all 8 migrations, seed, 218
  workspace tests) was verified against a real PostgreSQL 16.14 driven from
  `initdb` / `pg_ctl` on a non-temp path, torn down afterward. What's left:
  confirm CI goes green on GitHub's runners once something is pushed, and
  confirm `docker compose up`.
- **CI has never run.** Nothing pushed since Sprint 2 added the workflow.
  **Sprint 13 is awaiting commit** (Sprint 12 was committed).
- **`SavedArticles.tsx` / `TrustedPublishers.tsx` / `RecentlyVerified.tsx` /
  `UserStats.tsx` still run on mock data.** The two follow/saved screens have a
  shape mismatch with the Sprint 1 contract (`trustScore` number vs
  `trustStatus`, plus `tags` / `lastChecked` / `categories` /
  `transparencyLevel`); the other two need a search / stats endpoint.
- **`reader.service.ts` re-implements the trust-status derivation loop** that
  `verification.service.ts` also has, at list scale (shared inputs, duplicated
  loop). Extract a shared `deriveTrustStatusForVersions` if a third caller
  appears.
- **The follow list's `credibilityScore` is computed per publisher in a loop**
  (`creditAggregate` is 3 queries each). Fine at year-one follow counts; batch
  it if a reader can follow hundreds.
- **A saved article archived after saving silently drops from
  `GET /saved-articles`** (the list INNER-JOINs to a current published
  version). The bookmark row persists and is deletable by id.
- **`articleVersionSchema` content fields are `string | null` for every
  consumer** (Sprint 12), not only redacted reads. The generated frontend
  client types changed; non-redacted data never returns `null`.
- **`GET /publishers/{id}/articles` is not redaction-suppressed.**
- **`changeSummary` is not blanked on a redacted version.**
- **Redaction is irreversible**; **no un-redact endpoint**.
- **Drizzle snapshot drift for the anchoring status indexes is two migrations
  deep** — `schema/anchoring.ts` does not define
  `anchor_records_status_idx` / `anchor_batches_status_idx`. Repay when
  anchoring is next touched.
- **`article_versions.review_status = 'verified'` is dead as an API outcome**
  (Sprint 11); still honoured by the read overlay if present.
- **No verifier identity in the composed verification read.**
- **`RegisterForm.tsx` is wired for all three roles but not integration-tested**
  — needs a live Clerk project.
- **`reviewerSchema` in `GET /reviewers/pending` has no applicant identity or
  `applicationReason`.**
- **Admin decision endpoints don't reject a no-op.**
- **`registryMember` / `versionMatch` trustSummary facts are `true` on every
  200.**
- **Version-scoped `evidence` / `reviews` in the verification response are
  fetched with `LIMIT 1000`.**
- **No dispute frontend**, and **`ReviewsDisputes.tsx` untouched.**
- **`PublisherCredibility.tsx`'s "Correction History" box keeps mock counts for
  the no-`articleId` fallback.**
- **No reviewer-facing write UI** (Sprint 6). `ReviewerPortal.tsx` is a stub.
- **`Actor.role` is typed `string`, not the `account_role` enum** — only
  compared `=== "admin"`.
- **`dispute:file`, `review:create`, and `version:verify` share a switch `case`
  in `can`.** Correct and documented.
- **Dispute withdrawal is filer-only, even for an admin.** Deliberate.
- **Evidence hashes are not anchored.**
- **No real `ObjectStore`**, **no endpoint to read a stored evidence blob**.
- **No real `SourceArchiver`.** Repay with the Phase 5 threat pass.
- **Frontend evidence write path unwired.**
- **`apps/api/src/repositories/articles.repository.ts` cursor pagination keys on
  a millisecond-truncated `created_at` ISO string** (`listPublishedVersions`,
  `listForPublisher`); the id-keyed lists dodge it.
- **`apps/api`'s error handler maps only `AppError` / `ZodError` / Fastify
  schema `validation`** — a `415` / `413` becomes a generic `500`.
- **No real `AnchorProvider`.** Fake only.
- **No admin re-queue for `anchor_failed`.** Terminal since Sprint 4.
- **No backend search endpoint.**
- **`apps/web` has no `tsconfig.json`.** Pre-existing (Figma Make export).
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
pnpm --filter @sourceit/shared db:migrate      # applies all 8 migrations (0000–0007) for real — verified
pnpm --filter @sourceit/shared seed            # verified (2 articles, 2 saved articles, 2 follows, 1 redaction)
pnpm --filter @sourceit/anchoring test         # 33/33 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 178/178 — verified (160 prior + 18 reader)
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
