# Sprint 14 — Publisher Dashboard Reads

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

Implement the six remaining `GET /publishers/{id}/*` operations — the last
unbuilt slice of Phase 4 — so `openapi.json`'s entire contract is backed by a
handler. These are the publisher-dashboard reads (`PublisherProfileCard`,
`AnalyticsCards`, `RecentActivity`, `CredibilityPanel`, `ReviewsDisputes`). The
dashboard components are fully hardcoded (no props, no fetch), so — like Sprints
7/9/11/12/13 — this is backend + tests only; no component was wired.

Three points were confirmed with the user before implementation: (a) the three
authenticated reads (`/analytics`, `/activity`, `/reviews`) require only
`requireActor` (any signed-in account), not publisher membership; (b) start
**writing** `credibility_score_history` now — append a point on every
score-moving event, skipping the write when the score is unchanged — rather than
deferring it or synthesising it; (c) `GET /publishers/{id}/reviews` gets a real
composite `(createdAt, kind, id)` cursor that pages the interleaved
reviews+disputes stream. All three were built as confirmed. As a consequence of
(b) the same write hooks also emit `activity_events`, so `GET /activity` returns
real data for API-created content rather than only seed rows.

## 2. Changes from Previous Sprint

- **All 44 `openapi.json` operations are now implemented** (was 38). The six
  new handlers: `GET /publishers/{id}` (public profile),
  `GET /publishers/{id}/analytics`, `/activity`, `/reviews` (any authed
  account), `/credibility`, `/credibility-history` (public).
- **`credibility_score_history` and `activity_events` are now written by the API.**
  Both tables have existed unused since `0000`. A new
  `PublisherEventRecorder` (`services/publisherEvents.ts`) is injected into the
  article, review, dispute and version-verification services and called after a
  successful mutation:
  - `recordActivity` → an `activity_events` row, on: article publish
    (`publish`), major correction (`update`), minor correction (`correction`),
    review created (`review`), dispute filed (`dispute_filed`).
  - `recordCredibilitySnapshot` → recompute the live score and append a
    `credibility_score_history` point **only if it differs from the last
    point**, on: article publish, correction, archive, version verify, dispute
    file, dispute resolve/withdraw.
- **Four services gained a constructor parameter** (`articles`, `reviews`,
  `disputes`, `versionVerification`), and their five route files now build the
  recorder and pass it. `disputes.service`'s parameter is named `recorder` (not
  `events`) to avoid shadowing its existing `events` locals.
- **The cached `publishers.credibility_score` column is still not written.**
  Reads compute the score live via `computeCredibility`; the history table is a
  log of what that produced over time, not a settable value (build prompt:
  "Credibility is derived, never written").
- **`openapi/paths/publishers.ts` responses updated:** `/analytics` `403` → `401`
  (any authed account, so there is no membership `403`); `401` + `404` added to
  `/activity` and `/reviews`; `404` added to `/credibility` and
  `/credibility-history`.
- **No migration.** `activity_events` (+ its `(publisher_id, created_at)`
  index), `credibility_score_history` (+ its `(publisher_id, recorded_at)`
  index and `score BETWEEN 0 AND 100` check) all date from
  `0000_initial_schema.sql`.
- **Carried over, still carried:** no real Clerk Organization; no real chain
  `AnchorProvider`; no admin re-queue for `anchor_failed`; evidence hashes not
  anchored; no real `ObjectStore` / `SourceArchiver` / evidence-blob-read
  endpoint; no backend search; the Drizzle anchoring-index snapshot drift;
  `articles.repository.ts`'s millisecond-truncated `created_at` cursor.
- **Docker still unavailable** (fourteenth sprint). Verified against a real
  PostgreSQL 16 driven from `initdb` / `pg_ctl` on a non-temp path — see §7.

## 3. Key Enhancements

- `GET /publishers/{id}` (public) — the profile (`publisherSchema`) with the
  read-time `credibilityScore` / `transparencyLevel`. `404` unknown.
- `GET /publishers/{id}/analytics` (any authed) — `{ totalArticlesPublished,
  verifiedArticleCount, pendingReviewCount, disputedArticleCount }`, a pure
  reduction of the same `creditAggregate` the verification endpoint uses.
  `401` / `404`.
- `GET /publishers/{id}/activity` (any authed) — the append-only feed, newest
  first, keyset-paginated on `(createdAt, id)`. `401` / `404`.
- `GET /publishers/{id}/credibility` (public) — `{ score, tier, trend,
  factors: { verifiedArticles, disputedClaims, transparentCorrections } }`.
  `tier` is a label off the score (`≥90 Outstanding`, `≥75 Excellent`,
  `≥60 Good`, `≥40 Fair`, else `Poor`); `trend` is `score − lastHistoryPoint`
  (or `null` if there is no history). `404` unknown.
- `GET /publishers/{id}/credibility-history` (public) — the sparkline series
  `{ score, recordedAt }`, newest first, keyset on `(recordedAt, id)`. `404`.
- `GET /publishers/{id}/reviews` (any authed) — reviews **and** disputes against
  this publisher's articles as one chronological page. Cursor is
  `<createdAt ISO>~<kind>~<id>` (`kind ∈ {r, d}`): each table is fetched
  `limit+1` deep past the cursor's timestamp ceiling, merged, sorted
  `createdAt desc, kind, id`, filtered strictly past the cursor tuple, sliced
  to `limit`. Same-millisecond rows across the two tables neither repeat nor
  drop. `401` / `404`.
- **The dashboard is now live data.** Publishing, correcting, archiving,
  verifying, filing a dispute, resolving a dispute, and posting a review each
  leave a trail: an activity event (for the first five) and, when the score
  actually moves, a credibility history point.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/publishers.route.ts` →
  `services/publisherDashboard.service.ts` →
  `repositories/publisherDashboard.repository.ts` (+
  `repositories/verification.repository` for `creditAggregate`, +
  `repositories/publishers.repository` for `findById`). Plus the write-side
  `services/publisherEvents.ts` (`PublisherEventRecorder`).
- **The recorder is the one new cross-cutting seam.** It is a thin object over
  `publisherDashboard.repository` (inserts) and `verification.repository`
  (`creditAggregate` for the recompute). Injected, not global; each route that
  needs it constructs one.
- **No new dependency, no background process, no schema change, no new
  authorization primitive.** The dashboard reads use `requireActor` (or nothing,
  for the public ones); `can` was not touched.

## 5. Database Changes

**None.** `migrations/` is unchanged. New rows are written to
`activity_events` and `credibility_score_history`, both Sprint 1 tables. The
`credibility_history_score_range` check (`score BETWEEN 0 AND 100`) is respected
by `computeCredibility`'s `clamp(0..100)`.

## 6. New Components

**Endpoints** (all 44 operations across 35 paths in `openapi.json` are now
implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /publishers/{publisherId} | public | Profile + read-time credibility. 404 unknown. |
| GET | /publishers/{publisherId}/analytics | any authed | Derived aggregate counts. 401 / 404. |
| GET | /publishers/{publisherId}/activity | any authed | Append-only feed, newest first, paginated. 401 / 404. |
| GET | /publishers/{publisherId}/credibility | public | Published breakdown (score, tier, trend, factors). 404. |
| GET | /publishers/{publisherId}/credibility-history | public | Sparkline series, newest first, paginated. 404. |
| GET | /publishers/{publisherId}/reviews | any authed | Reviews + disputes, one chronological page, composite cursor. 401 / 404. |

**`apps/api` new modules:** `repositories/publisherDashboard.repository.ts`,
`services/publisherDashboard.service.ts`, `services/publisherEvents.ts`,
`routes/publishers.route.ts`.
**`apps/api` changed:** `services/articles.service.ts`,
`services/reviews.service.ts`, `services/disputes.service.ts`,
`services/versionVerification.service.ts` (each: recorder param + hook calls);
`routes/articles.route.ts`, `routes/publisherArticles.route.ts`,
`routes/reviews.route.ts`, `routes/disputes.route.ts`,
`routes/versionVerification.route.ts` (build + pass the recorder); `app.ts`
(register publisher routes).

**Contract (`packages/shared`):** `openapi/paths/publishers.ts` response codes
on the six paths; `openapi.json` + `src/client/schema.d.ts` regenerated, not
hand-edited. `publisherSchema`, `publisherAnalyticsSchema`,
`credibilityBreakdownSchema`, `credibilityHistoryPointSchema`,
`activityEventSchema` and the `union(reviewSchema, disputeSchema)` all existed
(Sprint 1) and were not changed.

**Seed:** six `credibility_score_history` points for The Daily Planet (a short
upward trend) so the sparkline endpoint has data without running the API.

## 7. Sprint Test Results

**Totals: 234 tests, 234 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 194 — up from
178 by the 16 new publisher-dashboard tests). No test was weakened, skipped, or
deleted. `pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings across all
four packages. No `any`, no `@ts-expect-error`. `apps/web`: `vite build`
succeeds (2204 modules, unchanged).

**`apps/api` — `test/publisherDashboard.integration.test.ts`: 16/16** (real
Postgres, `--no-file-parallelism`; fixture: one verified article, one disputed,
one corrected):

- `GET /publishers/{id}` — public; profile with a `[0,100]` `credibilityScore`
  and `transparencyLevel ≥ 1`; `404` unknown.
- `GET /publishers/{id}/analytics` — `401` no session; `200` for a
  **non-member** reader account with exactly
  `{ totalArticlesPublished: 3, verifiedArticleCount: 1, pendingReviewCount: 2,
  disputedArticleCount: 1 }`; `404` unknown.
- `GET /publishers/{id}/activity` — `401`; lists the events the publish /
  correct / dispute hooks wrote (`publish` ×3, `correction`, `dispute_filed`),
  newest first; cursor paging with no overlap.
- `GET /publishers/{id}/credibility` — public; `{ score, tier (string), trend
  (number|null), factors: { verifiedArticles: 1, disputedClaims: 1,
  transparentCorrections: 1 } }`; `404`.
- `GET /publishers/{id}/credibility-history` — public; has points written by
  the score-moving hooks, newest first, each `{ score∈[0,100], recordedAt }`;
  **a review does not add a point** (score unchanged) — asserted by comparing
  the table row count across a `POST /reviews`.
- `GET /publishers/{id}/reviews` — `401`; returns reviews (`comment` present)
  and disputes (`status` + `events` present) as one `createdAt`-descending
  stream; the composite cursor pages the merged stream across ≥4 items with no
  duplicate id; `404` unknown.

**Invariant / standard coverage:**
- *Credibility is derived, never written* — no endpoint or column sets the
  score; the history table logs recomputes and is append-only by nature; the
  cached `publishers.credibility_score` column stays unwritten.
- *Pagination* — cursor-based on every list: `(createdAt, id)` for activity and
  credibility-history, `(createdAt, kind, id)` for the two-table reviews stream;
  the millisecond-tie hazard is closed by the id (and kind) components.
- *Authorization* — the three authed reads `401` without an account and are
  proven reachable by a non-member; the three public reads take no auth. `404`
  for an unknown publisher on all six.
- *Layering* — route → service (no SQL) → repository (no HTTP); the write hooks
  live in the services, the inserts in the repository.
- *N+1* — analytics / credibility / the profile each run one `creditAggregate`
  (3 queries) and nothing per-article; the reviews stream is two bounded
  queries plus one events query.

**Existing suites, unchanged and still green:** `articles` 18, `reviews` 18,
`disputes` 31, `versionVerification` 13 (the four services that gained the
recorder hook — every prior test still passes, the recorder's inserts are
side-effects that break nothing), `evidence` 13, `verification` 11,
`redactions` 15, `reader` 18, `trust` 12, `admin` 12, `anchor` 4, `me` 3,
`registration` 10; `@sourceit/worker` 7; `@sourceit/anchoring` 33.

**Verification environment.** Docker unavailable (fourteenth sprint); the
`embedded-postgres` binaries are execution-blocked from `%LOCALAPPDATA%\Temp` on
this host (see Sprint 11 §7). All results are against a real **PostgreSQL
16.14** driven from `initdb` / `pg_ctl` on a non-temp path,
`vitest run --no-file-parallelism`. All 8 migrations (0000–0007) apply to a
fresh database; the seed (now with the credibility history points) runs.
Instance stopped and data directory removed afterward; no process holds port
55432.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2. Sprint
14 is awaiting commit.

## 8. Outcome

**Phase 4 is endpoint-complete.** Every operation in `openapi.json` now has a
handler, all verified against a real Postgres. The publisher dashboard reads —
profile, analytics, activity feed, credibility breakdown, credibility history,
and the merged reviews+disputes stream — return live data, and the write paths
(publish / correct / archive / verify / dispute file+resolve / review) now
leave an `activity_events` trail and, when the score moves, a
`credibility_score_history` point. 234/234 tests green.

**Not done, deliberately or blocked:**
- **The dashboard components are not wired.** `AnalyticsCards`,
  `CredibilityPanel`, `RecentActivity`, `PublisherProfileCard`,
  `ReviewsDisputes` are hardcoded with no props or fetch; wiring them would
  require restructuring, which the build prompt forbids. Backend + tests only,
  as Sprints 7/9/11/12/13.
- **`activity_events` covers only the API write paths in `apps/api`.** The
  worker's anchor-confirmation is not emitted as a `blockchain` activity event;
  redaction is not emitted as a `redaction` activity event (the recorder is not
  wired into `redactions.service`). Add those hooks if the feed needs them.
- **The cached `publishers.credibility_score` / `transparency_level` columns
  stay unwritten.** Reads compute live; history is the log. A future
  read-performance pass could populate them from the recorder.
- **`GET /publishers/{id}/reviews` fetches `limit+1` rows per table per page.**
  If a single publisher accrues more than `limit` reviews-or-disputes inside
  one millisecond at a page boundary, the page could under-fill; not realistic
  at year-one volume.
- **`trend` in the credibility breakdown is `liveScore − mostRecentPoint`, not
  a fixed-window (e.g. 30-day) delta.** The frontend mock says "+5 this month";
  a windowed trend needs a date-bounded history query.
- **No discriminator on the reviews-stream union.** A consumer tells a review
  from a dispute structurally (`comment` vs `status`/`events`). The Sprint 1
  schemas are frozen; adding a `kind` field is a contract change.

**Known debt incurred:**
- **Eight recorder hook points across four services.** Each is one or two
  `await` lines after the mutation. If a hook's insert ever fails it fails the
  request (no try/catch); acceptable — the tables are local and the insert is
  trivial — but a future resilience pass might make the recorder best-effort.
- `publisherDashboard.repository.ts` carries both the read queries and the
  recorder's insert helpers; splitting reads from writes is possible if it
  grows.
- The reviews-stream merge re-fetches both tables from the timestamp ceiling on
  every page rather than keeping a server-side position; fine for a dashboard
  list, revisit if it is ever hot.
- Carried, unchanged: the Drizzle anchoring-index snapshot drift;
  `articles.repository.ts`'s millisecond-truncated `created_at` cursor.

**Blocked on:** nothing.

**Next sprint should do first:** **Phase 5 — Hardening.** Rate limiting on auth
and every write endpoint; an N+1 audit on every list endpoint with `EXPLAIN` to
prove index use; structured error tracking (Sentry or equivalent); backups
configured and a restore tested once; `docs/RUNBOOK.md` (deploy, roll back, run
a migration, database at 90% connections); and a written threat pass — for each
endpoint, what the most motivated hostile user tries and what stops them.
**Before any of that: push to GitHub and confirm CI actually goes green — it
still never has, fourteen sprints in.**
