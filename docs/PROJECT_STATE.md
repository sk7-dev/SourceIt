# SourceIt — Project State
**Last updated:** end of Sprint 14  ·  **Current phase:** Phase 4 complete — next is Phase 5 (Hardening)

> **Sprint 14 is awaiting commit** — the working tree holds it. Commit plan is
> in the closing message. Sprint 13 was committed (git log confirms).

## Resume here

**Phase 4 is endpoint-complete.** Sprint 14 built the six publisher-dashboard
reads, so every one of the **44 operations in `openapi.json` now has a handler**,
all verified against a real Postgres:

- `GET /publishers/{id}` — public profile (`publisherSchema`) with read-time
  `credibilityScore` / `transparencyLevel`.
- `GET /publishers/{id}/analytics` — `{ totalArticlesPublished,
  verifiedArticleCount, pendingReviewCount, disputedArticleCount }`.
- `GET /publishers/{id}/activity` — append-only feed, newest first, keyset on
  `(createdAt, id)`.
- `GET /publishers/{id}/credibility` — `{ score, tier, trend, factors }`; tier
  `≥90 Outstanding / ≥75 Excellent / ≥60 Good / ≥40 Fair / else Poor`; trend =
  `score − lastHistoryPoint` or `null`.
- `GET /publishers/{id}/credibility-history` — sparkline series
  `{ score, recordedAt }`, newest first.
- `GET /publishers/{id}/reviews` — reviews **and** disputes as one chronological
  page; composite `<createdAt>~<kind>~<id>` cursor across both tables.

`/analytics`, `/activity`, `/reviews` are `requireActor` (any signed-in
account, **not** membership); the other three are public. `404` for an unknown
publisher on all six.

**`credibility_score_history` and `activity_events` are now written by the API.**
A `PublisherEventRecorder` (`services/publisherEvents.ts`) is injected into the
article / review / dispute / version-verification services and called after a
successful mutation: `recordActivity` (publish / update / correction / review /
dispute_filed) and `recordCredibilitySnapshot` (publish / correction / archive /
verify / dispute file / dispute resolve — appends a point only if the recomputed
score differs from the last). The cached `publishers.credibility_score` column
is still **not** written — reads compute live; the history table is the log.
Dashboard frontend components are hardcoded and were not wired (backend + tests
only). No migration. See [SPRINT_14_REPORT.md](sprints/SPRINT_14_REPORT.md).

Before Sprint 14: **reader features** (Sprint 13) — `POST /readers` + six
saved-article / publisher-follow endpoints, batched read-time `trustStatus` in
the saved list. See [SPRINT_13_REPORT.md](sprints/SPRINT_13_REPORT.md).

Before Sprint 13: **redaction** (Sprint 12) — `GET`/`POST /versions/{id}/redaction`,
admin-only, append-only tombstone, read-layer content suppression.

**TrustStatus** precedence (2026-09-09): `notfound > disputed >
publisher_unverified > authentic_under_review > updated > authentic`; anchor
state and redaction are separate tracks. All six values reachable for
API-created data. **Credibility** (2026-09-09):
`score = clamp(0..100, round(60 + 40·verifiedRatio − 35·openDisputeRatio +
10·correctionRatio))`, `transparencyLevel = clamp(1..5, 1 +
round(4·correctionRatio))`, over the publisher's published articles, `0 / 3`
when none. Computed at read time in `apps/api/src/services/trust.ts`; as of
Sprint 14 the value is also logged to `credibility_score_history` on
score-moving events (but the cached column stays unwritten).

**Biggest current gap:** **Phase 5 (Hardening) has not started**, and **nothing
has been pushed since Sprint 2 — CI and `docker compose up` have never run.**

Still mock / unbuilt, deliberately or blocked, after Sprint 14:

- **All Phase 5 items** — rate limiting; N+1 audit with `EXPLAIN`; structured
  error tracking; backups + a tested restore; `docs/RUNBOOK.md`; a written
  per-endpoint threat pass.
- **The publisher-dashboard frontend components are hardcoded** (`AnalyticsCards`,
  `CredibilityPanel`, `RecentActivity`, `PublisherProfileCard`,
  `ReviewsDisputes`) — no props, no fetch; wiring needs restructuring the build
  prompt forbids. Same for `SavedArticles.tsx` / `TrustedPublishers.tsx`
  (Sprint 13), `RecentlyVerified.tsx`, `UserStats.tsx` (need search / stats).
- **`activity_events` covers only the `apps/api` write paths** — the worker's
  anchor confirmation is not emitted as a `blockchain` event; redaction is not
  emitted as a `redaction` event.
- **`GET /publishers/{id}/articles` is not redaction-suppressed**;
  **`changeSummary` is not blanked on a redacted version**; **redaction is
  irreversible**; **no un-verify** of a `version_verifications` row.
- **No real Clerk Organization** — `publishers.clerk_org_id` is a
  `local_org_<uuid>` placeholder.
- **`ensureAccount` is first-writer-wins on `role`.**
- **`reviewerSchema` in the approval queue is identity-free.**
- **No dispute frontend**; `ReviewsDisputes.tsx` untouched.
- **No reviewer-facing write UI** (Sprint 6) — `ReviewerPortal.tsx` is a stub.
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
| 3 | Article vertical slice: backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |
| 4 | Anchoring slice: Merkle tree + proof + AnchorProvider, durable crash-safe worker, GET /versions/{id}/anchor | Complete with carryover | [SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md) |
| 5 | Evidence slice: multipart POST + public GET /versions/{id}/evidence, ObjectStore + SourceArchiver seams (fakes), append-only | Complete with carryover | [SPRINT_5_REPORT.md](sprints/SPRINT_5_REPORT.md) |
| 6 | Review slice: GET/POST /versions/{id}/reviews + retract, approved-reviewer gate, structural COI, append-only retraction | Complete with carryover | [SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md) |
| 7 | Dispute slice: 5 endpoints, publisher-cannot-suppress, terminal lifecycle, derived status, append-only — backend + tests only | Complete with carryover | [SPRINT_7_REPORT.md](sprints/SPRINT_7_REPORT.md) |
| 8 | Composed GET /articles/{id}/verification + read-time credibility; VerificationResult on one call | Complete with carryover | [SPRINT_8_REPORT.md](sprints/SPRINT_8_REPORT.md) |
| 9 | Admin decision queues: publisher-verification + reviewer-approval, single `admin` authz action — backend + tests only | Complete with carryover | [SPRINT_9_REPORT.md](sprints/SPRINT_9_REPORT.md) |
| 10 | Account provisioning: POST /publishers + POST /reviewers/apply, lazy `accounts` materialization, RegisterForm wired | Complete with carryover | [SPRINT_10_REPORT.md](sprints/SPRINT_10_REPORT.md) |
| 11 | Version-verification: POST /versions/{id}/verify, append-only `version_verifications`, `verified` derived at read time | Complete with carryover | [SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md) |
| 12 | Redaction: GET/POST /versions/{id}/redaction, admin-only, append-only tombstone (0007 trigger), read-layer suppression | Complete with carryover | [SPRINT_12_REPORT.md](sprints/SPRINT_12_REPORT.md) |
| 13 | Reader features: POST /readers + six saved-article/publisher-follow endpoints, batched read-time trustStatus | Complete with carryover | [SPRINT_13_REPORT.md](sprints/SPRINT_13_REPORT.md) |
| 14 | Publisher-dashboard reads: 6 GET /publishers/{id}/* endpoints; activity_events + credibility_score_history now written by the API | Complete with carryover | [SPRINT_14_REPORT.md](sprints/SPRINT_14_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. **19 tables** — unchanged since
Sprint 11 added `version_verifications`. Sprint 14 added no schema; it started
**writing** `activity_events` and `credibility_score_history` (both Sprint 1
tables, unused until now).

TrustStatus, credibility (the score) and `verified` are computed at read time.
`credibility_score_history` logs the score on each score-moving event;
`activity_events` logs publish / correction / review / dispute events. Redaction
is read-layer suppression. The cached `publishers.credibility_score` column is
still unwritten.

```
Account ──has role──> reader | publisher | reviewer | admin

Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership + reviewer-COI join]
Publisher (1) ──publishes──> (N) Article
Publisher (1) ──has──> (N) ActivityEvent           [written Sprint 14: publish/update/
                                                     correction/review/dispute_filed]
Publisher (1) ──has──> (N) CredibilityScoreHistory [written Sprint 14: one point per
                                                     score-moving event, deduped]

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

`packages/shared/openapi.json` — **35 paths / 44 operations; all 44 implemented**,
verified against a real database. `GET /healthz` / `GET /readyz` also exist but
are intentionally not in `openapi.json`.

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
| GET | /publishers/{publisherId} | public | 14 |
| GET | /publishers/{publisherId}/analytics | any authed | 14 |
| GET | /publishers/{publisherId}/activity | any authed | 14 |
| GET | /publishers/{publisherId}/credibility | public | 14 |
| GET | /publishers/{publisherId}/credibility-history | public | 14 |
| GET | /publishers/{publisherId}/reviews | any authed | 14 |
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

## Decisions

Append-only. Load-bearing entries kept; see the sprint reports for the rest.

- 2026-07-08 — Railway deploy target (Fly.io fallback). **Confirmed 2026-08-26.**
- 2026-07-08 — Clerk for auth. **Confirmed 2026-08-26.**
- 2026-08-26 — Anchor state always shows an explicit badge, never optimistic
  "verified." **Sprint 4.**
- 2026-08-26 — Dispute is a separate entity; a publisher may respond but never
  resolve/withdraw/hide. **Sprint 7.**
- 2026-08-26 — Credibility uses exactly the 3 factors the frontend shows;
  revisit as a versioned formula change.
- 2026-08-26 — Reviewer COI is structural (`publisher_members`), not the
  free-text `affiliation`. Shared by `review:create` / `dispute:file` /
  `version:verify`.
- 2026-08-26 — Redaction tombstones are fully public; the legal `reason` is not
  in the public schema. **Enforced Sprint 12.**
- 2026-08-26 — Publisher verification unverified → pending → verified (+
  rejected) by an `admin` account; one `admin` role, both queues.
- 2026-08-26 — Reader-facing trust status has 6 values.
- 2026-08-26 — Reviews/disputes are publicly attributed by pseudonym;
  `accounts.fullName` is never exposed. Extended Sprint 11 for
  `version_verifications`.
- 2026-08-26 — `/simple-login` and `/reader-portal` are dead. **Not yet
  deleted.**
- 2026-08-26 — Schema entity names frozen at the Sprint 1 stop point.
- 2026-08-26 — Session auth is a Clerk JWT `Authorization: Bearer`, verified
  with `@clerk/backend`.
- 2026-08-26 — The Fastify instance takes an injectable `SessionVerifier`; the
  database is never substituted (real Postgres, real migrations).
- 2026-08-27 — `packages/anchoring` canonicalization/hashing spec frozen
  (`docs/CANONICALIZATION.md`).
- 2026-09-08 — Merkle anchoring spec frozen (`docs/ANCHORING.md`); anchoring
  runs in a separate `apps/worker`; a failing batch retries with backoff then
  goes terminal `anchor_failed` after `ANCHOR_MAX_ATTEMPTS`.
- 2026-09-09 — `POST /versions/{id}/evidence` is `multipart/form-data`; object
  storage + source archival behind fakes; evidence attaches draft-only then
  frozen (409), rows append-only.
- 2026-09-09 — Evidence / review / dispute / saved-article / follow lists
  keyset-paginate on the row `id`, not `created_at`.
- 2026-09-09 — Dispute slice: `dispute:file` shares the `review:create` gate;
  `respond` = membership; `withdraw` = the filer alone; `resolve` = the filer or
  a `role === "admin"` account.
- 2026-09-09 — `GET /articles/{id}/verification` (Sprint 8): TrustStatus derived
  at read time with the confirmed precedence; anchor state is not an input; 404
  body is `{ trustStatus: "notfound", queriedId? }`.
- 2026-09-09 — Credibility score computed at read time; cached column / history
  table not written *(history table now written as of Sprint 14; cached column
  still not)*.
- 2026-09-09 — Admin queues: a single `{ type: "admin" }` action; decisions
  record author + timestamp, permissive on current state, `404` only unknown id.
- 2026-09-10 — Account provisioning (Sprint 10): `POST /publishers` /
  `/reviewers/apply` behind `requireAuth`; lazy `ensureAccount` keyed by the
  verified `clerkUserId`, first-writer-wins; placeholder `clerk_org_id`.
- 2026-09-10 — Version verification (Sprint 11): `POST /versions/{id}/verify`
  gated by `version:verify` = the `review:create` predicate; append-only
  `version_verifications` row, never an `UPDATE` of `review_status`; no anchor
  precondition; `verified` derived at read time; no un-verify.
- 2026-09-10 — Redaction (Sprint 12): `{ type: "admin" }` gate; read-layer
  suppression only (`article_versions` never modified); `tombstoneHash` =
  `contentHash`; append-only (`0007`), one-per-version → `409`; the legal
  `reason` returned by no endpoint; `articleVersionSchema` content fields
  loosened to nullable + a `redaction` field.
- 2026-09-10 — Reader features (Sprint 13): `POST /readers` mirrors Sprint 10;
  six per-reader endpoints behind `requireActor`; saved-list `trustStatus` is
  the six-value read-time derivation batched over the page; re-save/re-follow →
  `409`; `POST /saved-articles` requires a published version.
- 2026-09-10 — Publisher dashboard (Sprint 14): the three authed reads
  (`/analytics`, `/activity`, `/reviews`) require only `requireActor` (any
  account), **not** membership; the other three are public; `404` for an unknown
  publisher on all six. `credibility_score_history` and `activity_events` are
  written by a `PublisherEventRecorder` injected into the article / review /
  dispute / verification services — a credibility point only when the recomputed
  score changed. The cached `publishers.credibility_score` column stays
  unwritten. `GET /publishers/{id}/reviews` merges reviews + disputes into one
  chronological page with a composite `<createdAt>~<kind>~<id>` cursor. Tier
  ladder: `≥90 Outstanding / ≥75 Excellent / ≥60 Good / ≥40 Fair / else Poor`
  (revisitable). Confirmed with the user.

## Open questions

- *(none ranked as blocking)*.

## Known debt and deviations

- **Docker is still never available in this environment**, across fourteen
  sprints. The `embedded-postgres` prebuilt Windows binaries will not execute
  from the OS temp directory on this host (`STATUS_DLL_INIT_FAILED` — a
  path-based execution policy); copied to a non-temp path (`D:\…`) they run
  normally. Everything that mattered this sprint (all 8 migrations, seed, 234
  workspace tests) was verified against a real PostgreSQL 16.14 driven from
  `initdb` / `pg_ctl` on a non-temp path, torn down afterward. What's left:
  confirm CI goes green on GitHub's runners once something is pushed, and
  confirm `docker compose up`.
- **CI has never run.** Nothing pushed since Sprint 2 added the workflow.
  **Sprint 14 is awaiting commit.**
- **Phase 5 (Hardening) is entirely unstarted** — rate limiting, N+1/`EXPLAIN`
  audit, error tracking, backups + restore test, `RUNBOOK.md`, threat pass.
- **The publisher-dashboard + reader frontend components are hardcoded** and
  were not wired (would need restructuring the build prompt forbids):
  `AnalyticsCards`, `CredibilityPanel`, `RecentActivity`, `PublisherProfileCard`,
  `ReviewsDisputes`, `SavedArticles.tsx`, `TrustedPublishers.tsx`,
  `RecentlyVerified.tsx`, `UserStats.tsx`.
- **`activity_events` covers only the `apps/api` write paths** — no
  `blockchain` event from the worker's anchor confirmation, no `redaction`
  event from `redactions.service`.
- **The cached `publishers.credibility_score` / `transparency_level` columns
  stay unwritten** — reads compute live; `credibility_score_history` is the log.
- **`GET /publishers/{id}/reviews` fetches `limit+1` per table per page** — a
  page could under-fill if one publisher gets >`limit` reviews-or-disputes in a
  single millisecond at a boundary. Not realistic at year-one volume.
- **`trend` in the credibility breakdown is `liveScore − mostRecentPoint`**, not
  a fixed 30-day-window delta.
- **No discriminator on the `GET /publishers/{id}/reviews` union** — a consumer
  tells a review from a dispute structurally. Sprint 1 schemas are frozen.
- **The eight recorder hook calls fail the request if their insert fails** (no
  try/catch). Acceptable — local tables, trivial inserts — revisit in a
  resilience pass.
- **Drizzle snapshot drift for the anchoring status indexes is two migrations
  deep** — `schema/anchoring.ts` does not define
  `anchor_records_status_idx` / `anchor_batches_status_idx`. Repay when
  anchoring is next touched.
- **`articleVersionSchema` content fields are `string | null` for every
  consumer** (Sprint 12); non-redacted data never returns `null`.
- **`GET /publishers/{id}/articles` is not redaction-suppressed**;
  **`changeSummary` not blanked on a redacted version**; **redaction
  irreversible**; **no un-verify**.
- **`article_versions.review_status = 'verified'` is dead as an API outcome**
  (Sprint 11); still honoured by the read overlay if present.
- **No verifier identity in the composed verification read.**
- **`RegisterForm.tsx` wired for all three roles but not integration-tested** —
  needs a live Clerk project.
- **`reviewerSchema` in `GET /reviewers/pending` has no applicant identity.**
- **Admin decision endpoints don't reject a no-op.**
- **`registryMember` / `versionMatch` trustSummary facts are `true` on every
  200.**
- **Version-scoped `evidence` / `reviews` in the verification response use
  `LIMIT 1000`.**
- **No dispute frontend**; **no reviewer-facing write UI**;
  **`ReviewerPortal.tsx` is a stub.**
- **`Actor.role` is typed `string`, not the `account_role` enum.**
- **`dispute:file`, `review:create`, `version:verify` share a switch `case`.**
- **Dispute withdrawal is filer-only, even for an admin.**
- **Evidence hashes are not anchored.**
- **No real `ObjectStore`**, **no evidence-blob-read endpoint**, **no real
  `SourceArchiver`**, **frontend evidence write path unwired.**
- **`articles.repository.ts` cursor pagination keys on a millisecond-truncated
  `created_at`** (`listPublishedVersions`, `listForPublisher`).
- **The error handler maps only `AppError` / `ZodError` / Fastify `validation`**
  — `415` / `413` become a generic `500`.
- **No real `AnchorProvider`** (fake only); **no admin re-queue for
  `anchor_failed`.**
- **No backend search endpoint.**
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
`initdb`/`pg_ctl` on a non-temp path — Docker unavailable, and
`embedded-postgres` binaries blocked from `%TEMP%`; `apps/web` via `vite build`):

```
pnpm install                                   # workspace install
pnpm typecheck                                 # apps/api + apps/worker + packages/shared + packages/anchoring — 0 errors
pnpm lint                                      # same four — 0 errors/warnings
pnpm --filter @sourceit/shared db:migrate      # applies all 8 migrations (0000–0007) for real — verified
pnpm --filter @sourceit/shared seed            # verified (2 articles, 2 saved, 2 follows, 1 redaction, 6 credibility points)
pnpm --filter @sourceit/anchoring test         # 33/33 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 194/194 — verified (178 prior + 16 dashboard)
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
`sourceArchiver` in `buildApp`.

Still not possible here: `docker compose up` specifically, or Testcontainers
(both need Docker). On Windows, prefer a Postgres install outside
`%LOCALAPPDATA%\Temp` — binaries under the temp tree are execution-blocked on
this host. A killed launcher can leave an orphaned `postgres.exe` on the test
port — check with `Get-NetTCPConnection -LocalPort <port>`.
