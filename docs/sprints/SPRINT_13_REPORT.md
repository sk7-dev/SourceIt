# Sprint 13 — Reader Features

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

Complete the reader role end to end: a person can register as a reader, and a
reader can bookmark articles and follow publishers. This closes **reader account
provisioning** — carried forward since Sprint 10 and blocking this slice — and
the last stubbed path in `RegisterForm.tsx` (`// Readers have no backend
endpoint yet`). The six saved-article / publisher-follow endpoints, both join
tables, and the denormalized response schemas have existed unimplemented since
Sprint 1; this sprint implements all seven endpoints (`POST /readers` plus the
six) and wires `RegisterForm`'s reader path.

Four points were confirmed with the user before implementation: (a) a dedicated
`POST /readers`, exactly parallel to Sprint 10's `POST /publishers` /
`POST /reviewers/apply` — session-only, lazy `accounts` materialization; (b) the
saved-list `trustStatus` is the real six-value derivation from `trust.ts`,
batched over the page (no per-row N+1); (c) re-saving / re-following is a `409`,
consistent with the rest of the API; (d) frontend scope is `RegisterForm`'s
reader path only — `SavedArticles.tsx` and `TrustedPublishers.tsx` stay on mock
data, because their mock shapes carry fields the Sprint 1 contract does not
(`trustScore` number, `tags`, `lastChecked`, `categories`, `transparencyLevel`)
and wiring them cleanly would need component restructuring the build prompt
forbids. All four were built as confirmed.

## 2. Changes from Previous Sprint

- **`POST /readers` is new** (one new `openapi.json` path — the other six reader
  paths were already declared). `createReaderRequestSchema` (`{ fullName,
  email }`) was added to `zod/reader.ts`; the response is the existing
  `accountSchema`. `registration.service.ts` gained `registerReader` and a
  `toApiAccount` mapper, and `ensureCallerAccount`'s `role` parameter was
  widened from `"publisher" | "reviewer"` to include `"reader"`.
- **The six reader endpoints are now implemented** behind `requireActor`
  (they need a real account — materialized by `POST /readers`). New
  `reader.repository.ts` (11 methods across the two join tables + two
  existence checks + `currentVersionsForArticles`), new `reader.service.ts`,
  new `reader.route.ts`. The `openapi/paths/reader.ts` responses were filled
  in (`401` on every route, `404` / `409` where relevant, `403` on the two
  deletes).
- **`RegisterForm.tsx`'s reader path now goes through Clerk sign-up.** It
  previously short-circuited to a local confirmation before `signUp.create`
  ("Readers have no backend endpoint yet"); that branch is removed, so all
  three roles run the same Clerk flow, and `finishRegistration`'s reader case
  now calls `api.POST("/readers", …)` exactly like the publisher / reviewer
  cases. The visual layer is untouched.
- **No migration.** `saved_articles`, `publisher_follows` (both with a
  `(account_id, target)` UNIQUE constraint) and `accounts` all date from
  `0000_initial_schema.sql`.
- **Carried over, still carried:** publisher-dashboard reads (the last Phase 4
  slice); no real Clerk Organization; no real chain `AnchorProvider`; no admin
  re-queue for `anchor_failed`; evidence hashes not anchored; no real
  `ObjectStore` / `SourceArchiver` / evidence-blob-read endpoint; no backend
  search; the Drizzle anchoring-index snapshot drift; `articles.repository.ts`'s
  millisecond-truncated `created_at` cursor.
- **Docker still unavailable** (thirteenth sprint). Verified against a real
  PostgreSQL 16 driven from `initdb` / `pg_ctl` on a non-temp path — see §7.

## 3. Key Enhancements

- `POST /readers` (Clerk session) — body `{ fullName, email }`. Materializes
  the caller's `accounts` mirror row (`role = 'reader'`, keyed by the verified
  `clerkUserId`, identity from the body, idempotent — a repeat call from the
  same session returns the existing account and never overwrites it). `401` no
  session, `409` if the email is already on a different `clerkUserId`. After
  this, `GET /me` works for that session.
- `GET /saved-articles` (reader) — the caller's bookmarks, cursor-paginated on
  the row id, each denormalized to `{ id, articleId, title, publisherName,
  trustStatus, savedAt }`. `trustStatus` is the same six-value derivation as
  `GET /articles/{id}/verification`, computed over the current published
  version of each saved article with one batched query per input
  (current-versions, open-dispute ids, verified ids, redaction map) — no per-row
  N+1. A saved article whose current version is redacted has `title: ""`
  (Sprint 12). A saved article that is later archived or has only a draft drops
  out of the list; the bookmark row remains and is still deletable by id.
- `POST /saved-articles` (reader) — `{ articleId }`. `404` if the article is
  unknown, archived, or has no published version; `409` if already saved;
  `201` returns the same denormalized shape.
- `DELETE /saved-articles/{savedArticleId}` (reader) — `404` unknown, `403` if
  the row belongs to another reader, `204` on success. Never touches the
  article.
- `GET /publisher-follows` (reader) — the caller's follows, each
  `{ id, publisherId, publisherName, verified, credibilityScore, createdAt }`.
  `credibilityScore` is the read-time formula (`computeCredibility` over the
  publisher's article aggregate), looped per followed publisher.
- `POST /publisher-follows` (reader) — `{ publisherId }`. `404` unknown
  publisher, `409` already following, `201` with the same shape.
- `DELETE /publisher-follows/{followId}` (reader) — `404` / `403` / `204`.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/reader.route.ts` → `services/reader.service.ts`
  → `repositories/reader.repository.ts`. The service also takes the existing
  `verification.repository` for the three batched read-time overlays it shares
  with `GET /articles/{id}/verification` (`findVersionIdsWithOpenDispute`,
  `findVerifiedVersionIds`, `findRedactionsForVersions`) and `creditAggregate`
  for the follow list's `credibilityScore`.
- **`POST /readers` lives in the existing `registration.route.ts` /
  `registration.service.ts`** alongside `POST /publishers` and
  `POST /reviewers/apply` — same `requireAuth` (session, not account) pattern.
- **No new dependency, no background process, no schema change, no new
  authorization primitive.** The six reader endpoints are per-account private
  reads/writes gated by `requireActor` plus an owner check on the two deletes;
  `can` was not touched.

## 5. Database Changes

**None.** `migrations/` is unchanged. `POST /readers` inserts an `accounts` row
(when absent); the reader endpoints insert / delete `saved_articles` and
`publisher_follows` rows. The `(account_id, article_id)` and
`(account_id, publisher_id)` UNIQUE constraints (which back the `409` on a
repeat) have existed since `0000_initial_schema.sql`.

## 6. New Components

**Endpoints** (of 44 operations across 35 paths in `openapi.json`, 38 now
implemented — the 6 remaining are the publisher-dashboard reads):

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | /readers | Clerk session (account materialized) | Register a reader. 401 no session, 409 email clash. |
| GET | /saved-articles | reader | The caller's bookmarks, denormalized with a real trustStatus. |
| POST | /saved-articles | reader | Bookmark an article. 404 unknown/archived/draft-only, 409 already saved. |
| DELETE | /saved-articles/{savedArticleId} | reader | Unbookmark. 403 not the owner, 404 unknown. |
| GET | /publisher-follows | reader | The caller's follows, with verified + credibilityScore. |
| POST | /publisher-follows | reader | Follow a publisher. 404 unknown, 409 already following. |
| DELETE | /publisher-follows/{followId} | reader | Unfollow. 403 not the owner, 404 unknown. |

Layering: `routes/reader.route.ts` → `services/reader.service.ts` →
`repositories/reader.repository.ts` (+ `repositories/verification.repository.ts`
for the shared derivations) → Postgres.

**`apps/api` new modules:** `repositories/reader.repository.ts`,
`services/reader.service.ts`, `routes/reader.route.ts`.
**`apps/api` changed:** `services/registration.service.ts` (`registerReader`,
`toApiAccount`, widened `role`); `routes/registration.route.ts` (`POST /readers`);
`app.ts` (route registration).

**Contract (`packages/shared`):** `zod/reader.ts` (`createReaderRequestSchema`);
`openapi/paths/reader.ts` (`POST /readers` + response codes on all seven);
`openapi.json` + `src/client/schema.d.ts` regenerated, not hand-edited.
`savedArticleSchema` / `publisherFollowSchema` / the two create-request schemas
already existed (Sprint 1) and were not changed.

**Frontend:** `RegisterForm.tsx` — reader path routed through Clerk `useSignUp`
and `POST /readers` (mirrors the publisher/reviewer paths wired in Sprint 10).

**Seed:** the reader now has two saved articles (one of them the Sprint 12
redacted article — its title blanks in the list) and follows two publishers (the
verified Daily Planet and the unverified Times — `verified: false`).

## 7. Sprint Test Results

**Totals: 218 tests, 218 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 178 — up from
160 by the 18 new reader tests). No test was weakened, skipped, or deleted.
`pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings across all four
packages. No `any`, no `@ts-expect-error`. `apps/web`: `vite build` succeeds
(2204 modules, unchanged) with the wired `RegisterForm`.

**`apps/api` — `test/reader.integration.test.ts`: 18/18** (real Postgres,
`--no-file-parallelism`):

*`POST /readers`* — `401` no session; `400` malformed body; **`201`**: response
is `accountSchema` with `role: "reader"`, and `GET /me` for that session then
`200`s; **idempotent**: a repeat call from the same session returns the same
account id and does not overwrite `fullName`; **`409`** when the email is on a
different `clerkUserId`.

*`GET /saved-articles`* — `401` no session, `401` a valid session with no
account row; empty page for a fresh reader; **denormalized rows** with the real
per-article `trustStatus` (`authentic` for a verified v1.0, `disputed` for one
with an open dispute); cursor pagination across three saves without overlap.

*`POST /saved-articles`* — `401`; `404` for an unknown, an archived, and a
draft-only article; **`201`** with `{ articleId, title, publisherName,
trustStatus }`; **`409`** on a duplicate.

*`DELETE /saved-articles/:id`* — `404` unknown; **`403`** another reader's row;
**`204`** the owner's, and it is gone from the list.

*publisher follows* — `401` unauthenticated list; `404` unknown publisher;
**`201`** with `verified: true` and a numeric `credibilityScore` in `[0,100]`;
**`409`** duplicate; **`403`** unfollowing another reader's row; **`204`** the
owner's.

*redaction interaction* — a saved article whose current version is then redacted
shows `title: ""` in `GET /saved-articles`.

**Invariant / standard coverage:**
- *One source of truth for identity* — `POST /readers` keys on the verified
  `clerkUserId`; `ensureAccount` never overwrites an existing row.
- *Authorization* — every reader route `401`s without an account; the two
  deletes `403` a non-owning reader (proven with a second reader account); the
  reads are scoped to `actor.accountId` at the repository layer.
- *Layering* — route (`requireActor` + Zod) → service (no SQL) → repository
  (no HTTP).
- *Pagination* — cursor-based on the row `id`, the same convention as
  evidence / reviews / disputes.
- *Standard 4xx matrix* — `401` / `400` / `403` / `404` / `409` each covered.
- *Derived, never stored* — the saved list's `trustStatus` and the follow
  list's `credibilityScore` are computed at read time with the same functions
  the verification endpoint uses.

**Existing suites, unchanged and still green:** `registration` 10 (the
`registerReader` addition and the widened `role` broke nothing), `articles` 18,
`evidence` 13, `reviews` 18, `disputes` 31, `verification` 11, `redactions` 15,
`versionVerification` 13, `trust` 12, `admin` 12, `anchor` 4, `me` 3;
`@sourceit/worker` 7; `@sourceit/anchoring` 33.

**Verification environment.** Docker unavailable (thirteenth sprint); the
`embedded-postgres` binaries are execution-blocked from `%LOCALAPPDATA%\Temp` on
this host (see Sprint 11 §7). All results are against a real **PostgreSQL
16.14** driven from `initdb` / `pg_ctl` on a non-temp path,
`vitest run --no-file-parallelism`. All 8 migrations (0000–0007) apply to a
fresh database; the seed (now with 2 saved articles + 2 follows) runs. Instance
stopped and data directory removed afterward; no process holds port 55432.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2. Sprint
13 is awaiting commit.

## 8. Outcome

**Done and verified against a real Postgres:** the reader role end to end —
`POST /readers` (lazy account, idempotent, email-clash `409`), all six
saved-article / publisher-follow endpoints (the batched read-time `trustStatus`
and `credibilityScore`, the owner checks on delete, the `409` on repeat, the
`404` matrix, redaction blanking the saved title), and `RegisterForm`'s reader
path wired to Clerk sign-up. 218/218 tests green.

**Not done, deliberately or blocked:**
- **`SavedArticles.tsx` / `TrustedPublishers.tsx` still run on mock data.** Their
  hardcoded arrays carry fields the contract does not (`trustScore` number,
  `tags`, `lastChecked`, `categories`, `transparencyLevel`); wiring them would
  require restructuring the components' render logic, which the build prompt
  forbids. Also still mock: `RecentlyVerified.tsx`, `UserStats.tsx` (both need a
  backend search / stats endpoint that does not exist).
- **`POST /saved-articles` requires a published version.** You cannot bookmark
  a draft-only article — there is nothing for the trust-status list to show.
  `404` in that case. A "watch this article" feature for unpublished drafts is
  not in scope.
- **The follow list's `credibilityScore` is computed per followed publisher in
  a loop** (`creditAggregate` is 3 queries each). Fine at year-one reader
  follow counts; batch it (`WHERE publisher_id IN (…)` grouped) if a reader can
  follow hundreds.
- **A saved article that is archived after saving silently drops from
  `GET /saved-articles`.** The bookmark row persists and can be deleted by id;
  it just does not render (the list INNER-JOINs to a current published
  version). Acceptable; revisit if readers need to see "this article you saved
  was withdrawn."
- **No `GET /readers/{id}` or reader profile.** A reader has only an `accounts`
  row; there is nothing role-specific to read.

**Known debt incurred:**
- `reader.repository.ts` has 11 methods spanning two entities in one file.
  Acceptable — they are all thin and share the `currentVersionsForArticles`
  helper; split into `savedArticles` / `publisherFollows` repositories only if
  one grows.
- `reader.service.ts` re-implements the "current version + verified overlay +
  dispute overlay" logic that `verification.service.ts` also has, at list
  scale. The shared inputs come from the same repository methods, but the
  derivation loop is duplicated. Extract a shared `deriveTrustStatusForVersions`
  if a third caller appears.
- Carried, unchanged: the Drizzle anchoring-index snapshot drift;
  `articles.repository.ts`'s millisecond-truncated `created_at` cursor.

**Blocked on:** nothing.

**Next sprint should do first:** the **last Phase 4 slice** —
publisher-dashboard reads (`GET /publishers/{id}`, `/analytics`, `/activity`,
`/credibility`, `/credibility-history`, `/reviews`), which likely also decides
whether to finally write the cached `credibility_score` column and
`credibility_score_history` table. After that, Phase 4 is complete and Phase 5
(hardening: rate limiting, N+1 audit with `EXPLAIN`, error tracking, backups,
`RUNBOOK.md`, a written threat pass) begins. Independently and now very overdue:
**push to GitHub and confirm CI actually goes green — it still never has.**
