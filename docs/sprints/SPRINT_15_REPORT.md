# Sprint 15 — Hardening (Phase 5)

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

The build prompt's final phase: make the system safe to run. In one sprint —
rate limiting on reads and writes, an N+1 audit of every list endpoint with
`EXPLAIN (ANALYZE)` against a bulk dataset (and any missing indexes),
hardened error handling (framework 4xx mapped onto the standard envelope,
grouped 5xx logging), `docs/RUNBOOK.md`, and a written per-endpoint threat pass
(`docs/THREAT_MODEL.md`). Structured error tracking is the existing pino logging,
hardened, not a new dependency (confirmed with the user). Backups and a tested
restore are **documented in the runbook, not executed** — there is no live
deployment. This is the last phase of the build-prompt structure.

Three points were confirmed with the user: one big Sprint 15 rather than a
split; in-memory `@fastify/rate-limit` (Redis is a one-option swap, documented);
and structured logs rather than a Sentry dependency.

## 2. Changes from Previous Sprint

- **`buildApp` is now `async`** and returns `Promise<FastifyInstance>`. A
  non-`await`ed `app.register` of `@fastify/rate-limit`'s global hook silently
  fails to attach when further `register` calls follow it (Fastify v5 +
  rate-limit v10) — so the rate-limit plugin must be awaited before routes
  register. `src/server.ts` and `test/testApp.ts` (the only two call sites)
  `await buildApp(...)`.
- **New dependency: `@fastify/rate-limit@^10`** — the boring, in-tree choice
  for per-IP limiting; writing it by hand would be worse. `pnpm-lock.yaml`
  updated.
- **`env.ts` gained `RATE_LIMIT_MAX` (300), `RATE_LIMIT_WRITE_MAX` (30),
  `RATE_LIMIT_WINDOW_MS` (60000)** — all optional with defaults, Zod-coerced.
- **`errorHandler.ts`** now maps a framework 4xx (`error.statusCode` in
  400–499) onto `{ code, message }` — `413 → PAYLOAD_TOO_LARGE`,
  `415 → UNSUPPORTED_MEDIA_TYPE`, `429 → RATE_LIMITED`, else `BAD_REQUEST` —
  instead of letting it fall through to a misleading `500` (repays a
  long-standing known-debt item). The `500` branch now logs `reqId`, `method`,
  `route`, and a stable `fingerprint` (`<error code/name> <first in-repo stack
  frame>`) for grouping.
- **`migrations/0008_hardening_indexes.sql`** — two composite indexes found by
  the EXPLAIN audit: `saved_articles(account_id, id)` and
  `publisher_follows(account_id, id)`. Also declared in
  `packages/shared/src/db/schema/reader.ts`, so schema and migration agree
  (unlike the Sprint 5 anchoring-index drift).
- **`verification.repository.ts` gained `creditAggregateForPublishers(ids)`** —
  the follow-list credibility was one `creditAggregate` (3 queries) *per
  followed publisher*; it is now 3 queries for the whole page.
  `reader.service.toApiFollows` was rewritten to use it (N+1 removed).
- **`migrations/meta/0007_snapshot.json`** had its `id` / `prevId` fixed — it
  was a byte-copy of `0006`'s snapshot (from the Sprint 12 trigger-only
  migration) and `drizzle-kit generate` refused to chain past the collision.
  It now has a fresh `id` and `prevId = <0006 id>`.
- **`eslint.config.js`** ignores `**/test/fixtures/**` — the rate-limit smoke
  test is a plain-Node CJS script, not a TS/ESM source.
- **Carried over, still carried:** no real Clerk Organization; no real chain
  `AnchorProvider`; no admin re-queue for `anchor_failed`; evidence hashes not
  anchored; no real `ObjectStore` / `SourceArchiver` / evidence-blob-read
  endpoint (the `SourceArchiver` SSRF surface is named in the threat model as
  the top item for that slice); no backend search; the millisecond `created_at`
  cursor in `articles.repository.ts`.
- **Docker still unavailable** (fifteenth sprint). Verified against a real
  PostgreSQL 16 on a non-temp path — see §7.

## 3. Key Enhancements

- **Rate limiting** (`src/plugins/rateLimit.ts`): one global per-IP budget for
  reads (`RATE_LIMIT_MAX`), a tighter one for every `POST`/`PUT`/`PATCH`/`DELETE`
  (`RATE_LIMIT_WRITE_MAX`) attached via an `onRoute` hook. Key is the first hop
  of `X-Forwarded-For`, else the socket address (Fastify's `trustProxy` is
  deliberately not used — it turns the limiter into a no-op under `app.inject`).
  `/healthz` and `/readyz` are never limited. A `429` is the standard
  `{ code: "RATE_LIMITED", message: "… retry after Ns" }` envelope. Per-instance
  — a Redis store swap for multi-instance is a one-option change, documented in
  the runbook.
- **Error handling**: a wrong or missing `Content-Type` on a JSON route now
  returns `415 UNSUPPORTED_MEDIA_TYPE`; an over-limit multipart upload returns
  `413 PAYLOAD_TOO_LARGE`; both as the standard envelope, not a `500`. Every
  unexpected `500` still returns an opaque `INTERNAL_ERROR` and now logs a
  grouping fingerprint.
- **Indexes**: `GET /saved-articles` and `GET /publisher-follows` keyset queries
  went from a primary-key scan with an `account_id` filter to a clean
  `Index Cond: (account_id = X AND id > cursor)` — proven with `EXPLAIN` before
  and after (`docs/PERFORMANCE.md`).
- **N+1 removed** from `GET /publisher-follows`.
- **`docs/RUNBOOK.md`**: deploy, code-vs-schema rollback (they move
  independently — spelled out), running a migration, the "database at 90%
  connections" playbook (`pg_stat_activity` triage, terminating leaked
  transactions, PgBouncer), the anchoring-worker-stuck procedure, and the
  backup + quarterly restore-drill plan with an explicit statement of what a
  restore loses.
- **`docs/THREAT_MODEL.md`**: per-endpoint-group — the attack a motivated
  hostile user tries and what stops it — anchored to the Section 1 invariants
  (append-only triggers, structural COI, publisher-cannot-suppress, derived
  credibility, redaction-not-deletion), plus the residual-risk list (fake
  anchor provider, no real object store, SSRF surface of the future archiver,
  per-instance rate limiting).
- **`docs/PERFORMANCE.md`**: the full N+1 audit table and every `EXPLAIN
  ANALYZE` plan, run against a synthetic 2 × 4 000-article / 8 000-version /
  8 000-review dataset.

## 4. Architecture Changes

- **`buildApp` is async.** The only structural change — forced by the
  rate-limit plugin's registration ordering.
- **New module `src/plugins/rateLimit.ts`** (`configureRateLimit(app, cfg)`),
  called from `buildApp`. Extracted so the plain-Node smoke test can inline the
  same wiring.
- **No new service, no new repository beyond one method, no background
  process, no schema table.** `0008` is two indexes.
- **Testing note**: `@fastify/rate-limit`'s in-memory store misbehaves under
  vitest's module runner (it works in real Node). The rate-limit wiring is
  therefore exercised over real HTTP by a plain-Node script
  (`test/fixtures/rate-limit-smoke.cjs`) that
  `test/hardening.integration.test.ts` spawns and asserts on.

## 5. Database Changes

**`migrations/0008_hardening_indexes.sql`** — two non-unique btree indexes, no
table or column change.

| Index | Serves | Before |
|---|---|---|
| `saved_articles_account_id_id_idx` on `(account_id, id)` | `GET /saved-articles` — `WHERE account_id = $1 AND id > $cursor ORDER BY id` | PK scan with an `account_id` filter; degrades for a reader with few saves among many rows |
| `publisher_follows_account_id_id_idx` on `(account_id, id)` | `GET /publisher-follows` (same query shape) | same |

Both `CREATE INDEX IF NOT EXISTS`, non-destructive, transparent to running
code. On a large table these should be `CREATE INDEX CONCURRENTLY` (runbook);
here they were applied normally against a fresh database.

## 6. New Components

No new endpoints — Phase 4 already reached all 44 operations. New modules:
`src/plugins/rateLimit.ts`; `test/hardening.integration.test.ts`;
`test/fixtures/rate-limit-smoke.cjs`; `docs/RUNBOOK.md`, `docs/THREAT_MODEL.md`,
`docs/PERFORMANCE.md`. Changed: `src/app.ts` (async, rate-limit wiring),
`src/server.ts` / `test/testApp.ts` (`await buildApp`), `src/env.ts` (3 vars),
`src/plugins/errorHandler.ts` (4xx mapping + 5xx fingerprint),
`src/repositories/verification.repository.ts` (`creditAggregateForPublishers`),
`src/services/reader.service.ts` (batched follow credibility),
`packages/shared/src/db/schema/reader.ts` (2 index decls), `eslint.config.js`.

## 7. Sprint Test Results

**Totals: 237 tests, 237 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 197 — up from
194 by the 3 new hardening tests). No test was weakened, skipped, or deleted.
`pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings across all four
packages. No `any`, no `@ts-expect-error`. `apps/web`: `vite build` succeeds
(2204 modules, unchanged).

**`apps/api` — `test/hardening.integration.test.ts`: 3/3**:
- **rate limiting (real HTTP)** — a spawned plain-Node process builds a Fastify
  app with the same config as `src/plugins/rateLimit.ts` and asserts over real
  `fetch`: `READ_MAX` reads succeed then `429`; the `429` body is
  `{ code: "RATE_LIMITED", message: /retry after/ }`; a `POST` route is cut off
  at the tighter `WRITE_MAX`; `GET /healthz` is never limited. The test fails if
  the script exits non-zero.
- **`415`** — `POST /articles` with `Content-Type: application/xml` →
  `415 { code: "UNSUPPORTED_MEDIA_TYPE" }` (was a `500` before this sprint).
- **`413`** — a 26 MB multipart `file` part to `POST /versions/{id}/evidence` →
  `413 { code: "PAYLOAD_TOO_LARGE" }` (was a `500`).

**Invariant / standard coverage:**
- *Rate limit auth and any write endpoint* — the `onRoute` hook applies
  `RATE_LIMIT_WRITE_MAX` to every mutating method; reads get the global budget;
  health checks are exempt. Proven over real HTTP.
- *Error envelope* — every non-2xx now carries `{ code, message }`, including
  the framework `4xx` that used to leak through as `500`.
- *N+1 audit* — `docs/PERFORMANCE.md` records every list query's `EXPLAIN
  ANALYZE`; the one true N+1 (`GET /publisher-follows` credibility) is fixed and
  the two PK-scan keysets are indexed and re-proven.
- *Logging* — an unexpected `5xx` logs `reqId` + `route` + `fingerprint`; no
  PII in the fingerprint (it is the error kind + a stack frame path).

**Existing suites, unchanged and still green:** `articles` 18, `evidence` 13,
`reviews` 18, `disputes` 31, `verification` 11, `redactions` 15, `reader` 18,
`versionVerification` 13, `publisherDashboard` 16, `admin` 12, `anchor` 4,
`me` 3, `registration` 10, `trust` 12; `@sourceit/worker` 7;
`@sourceit/anchoring` 33. The async `buildApp` and the error-handler change
broke nothing.

**Verification environment.** Docker unavailable (fifteenth sprint); the
`embedded-postgres` binaries are execution-blocked from `%LOCALAPPDATA%\Temp` on
this host (see Sprint 11 §7). All results are against a real **PostgreSQL
16.14** driven from `initdb` / `pg_ctl` on a non-temp path. The EXPLAIN audit
loaded a synthetic bulk dataset into a scratch database; all 9 migrations
(0000–0008) apply to a fresh database; the seed runs. Instance stopped and data
directory removed afterward; no process holds port 55432.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2. Sprint
15 is awaiting commit. The rate-limit smoke test shells out to `node` on a
fixture path, which CI's `ubuntu-latest` runs fine.

## 8. Outcome

**The build-prompt phase structure is complete.** Phases 0–4 built the contract,
the skeleton, and every vertical slice; Phase 5 hardened it: per-IP rate
limiting on reads and (tighter) writes, a clean error envelope for the
framework 4xx that used to surface as 500s, grouped 5xx logging, an N+1 audit
with `EXPLAIN`-proven index coverage and one real N+1 removed, and the two
operational documents (`RUNBOOK.md`, `THREAT_MODEL.md`) plus `PERFORMANCE.md`.
237/237 tests green.

**Not done, deliberately or blocked:**
- **Backups and a tested restore are documented, not executed** — there is no
  live database. `RUNBOOK.md` has the snapshot policy, the `pg_dump`/`pg_restore`
  commands, the quarterly drill, and an explicit statement of what a restore
  loses; running it needs a deployment.
- **No error-tracking vendor** — the "structured logs, no new dep" choice.
  Alerting is left to the deploy platform's log-based alerts; the `fingerprint`
  field is the grouping key for whatever is wired up.
- **Rate limiting is per-instance.** Exact cross-instance limits need the Redis
  store (documented).
- **`CREATE INDEX CONCURRENTLY` not used for `0008`** — the two indexes are
  small and were applied normally; the runbook covers the concurrent path for
  future large-table indexes.
- **`GET /publishers/{id}/reviews`** still re-queries both tables from the
  cursor timestamp on every page; fine for a dashboard list at year-one volume.
- **The `SourceArchiver` SSRF surface** is called out in the threat model as
  the top item for the (still unbuilt) real-archiver slice.

**Known debt incurred:**
- **`buildApp` is async** — a small ergonomic cost paid to a Fastify plugin
  ordering quirk; both call sites updated.
- **The rate-limit wiring is inlined twice** — once in
  `src/plugins/rateLimit.ts` (production) and once in
  `test/fixtures/rate-limit-smoke.cjs` (the real-HTTP test), because the fixture
  is plain CJS and can't import the TS module. The values are simple and a
  comment links them; drift risk is low.
- **`@fastify/rate-limit` under vitest** does not limit (works in real Node) —
  the reason the smoke test is a subprocess. Documented in the test file.
- Carried, unchanged: the Drizzle anchoring-index snapshot drift (the `0007`
  snapshot id was fixed so `drizzle-kit generate` works again, but
  `schema/anchoring.ts` still lacks the two 0005 status indexes);
  `articles.repository.ts`'s millisecond `created_at` cursor.

**Blocked on:** nothing.

**Next steps** (beyond the build-prompt structure, which is now complete):
1. **Push to GitHub and confirm CI goes green** — fifteen sprints in, it has
   still never run. This is the single highest-value remaining action.
2. Then, in priority order: the real `AnchorProvider` (the chain root of trust
   is a fake); the real `ObjectStore` + an evidence-blob-read endpoint; the real
   `SourceArchiver` with the SSRF guard from the threat model; an admin re-queue
   for `anchor_failed`; reader/dashboard frontend wiring (needs the components
   restructured, which the build prompt forbade — revisit that constraint with
   the user); backend search.
