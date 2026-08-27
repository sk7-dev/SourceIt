# Sprint 2 — Skeleton
**Dates:** 2026-08-26 → 2026-08-26  ·  **Status:** Complete with carryover

## 1. Objective

Build everything around the features rather than a feature itself: a running
`apps/api` with auth, error handling, structured logging, config validation,
health/readiness endpoints, Docker Compose for local Postgres, CI, and exactly
one fully-implemented endpoint (`GET /me`) with an integration test, proving the
whole `route → validate → service → repository → database` spine works — per
the build prompt's Phase 2. The objective did not change mid-sprint.

## 2. Changes from Previous Sprint

- Sprint 1's biggest flagged gap — migrations never run against a live
  database — is **still not closed**. This environment has no Docker, so
  Testcontainers (the build prompt's specified integration-test mechanism)
  cannot start a Postgres container here either. What changed: the *reason*
  moved from "no Postgres available at all" to "no Docker available in this
  specific environment," and the actual server was verified live against a
  reachable-but-fake `DATABASE_URL` for everything that doesn't require a real
  connection (see Section 7). This is a real gap, not a smaller version of the
  same gap — it should be closed by running `pnpm test` somewhere with Docker
  (a laptop, or CI) before Sprint 3 trusts the repository layer.
- One assumption from Sprint 1 turned out to need a design decision this
  sprint, not just a value: Sprint 1's `openapi.json` never specified *how* a
  client authenticates (just `security: authed`). This sprint fixed it to
  Clerk's session JWT as a bearer token, verified server-side via
  `@clerk/backend`'s `verifyToken`. That wasn't a reversal of anything, just the
  first time it needed to be concrete.
- New engineering decision, not asked for by Sprint 0/1: rather than requiring
  a live Clerk project to exercise `apps/api`'s integration tests, session
  verification is injected (`SessionVerifier` type, `src/auth/verifySession.ts`)
  — production code calls real Clerk, tests substitute a fixed
  token-to-clerkUserId mapping. The database is never faked (Testcontainers
  Postgres, both migrations actually applied). Recorded as a decision below
  since it's a real design choice with a real tradeoff, not just plumbing.

## 3. Key Enhancements

For the first time, something in this codebase actually runs:

- `apps/api` boots, refuses to start with a clear error if `DATABASE_URL`,
  `CLERK_SECRET_KEY`, or `CLERK_PUBLISHABLE_KEY` is missing or malformed, and
  serves `GET /healthz` (liveness), `GET /readyz` (readiness — actually checks
  the database), and `GET /me` (requires a valid Clerk session; returns the
  account plus its publisher/reviewer profile ids).
- Every non-2xx response — 401 unauthenticated, 404 not found, 404 route not
  matched, 400 validation, 500 unhandled — comes back in the one error envelope
  shape (`{ code, message, details? }`) the whole API will use.
- `docker compose up` brings up a local Postgres matching `.env.example`'s
  `DATABASE_URL`.

## 4. Architecture Changes

- New `apps/api` package: `route → validate → service → repository → database`
  layering is now a real directory structure
  (`src/routes`, `src/services`, `src/repositories`, `src/db.ts`), not just a
  rule in a document.
- New dependencies and why each was added over writing it by hand:
  - `fastify` — the framework named in the build prompt's stack section.
  - `@clerk/backend` — server-side verification of a Clerk session JWT; avoids
    hand-rolling JWT/JWKS handling for the vendor already chosen for auth.
  - `pg` + `drizzle-orm` (direct deps of `apps/api`, not just re-exported from
    `packages/shared`) — `apps/api` owns its own connection pool built from its
    own validated `env`, rather than importing `packages/shared`'s client (which
    parses `DATABASE_URL` a second time, independently); the two packages
    should not silently disagree about config.
  - `testcontainers` / `@testcontainers/postgresql` — the build prompt names
    this explicitly for integration tests: real HTTP against a real,
    disposable database, not a mock.
  - `eslint` + `typescript-eslint` — the build prompt's Sprint 2 CI deliverable
    requires a lint step; there was none before this sprint. Scoped to
    `apps/api` and `packages/shared` only — `apps/web` is a Figma export we're
    told not to restyle or restructure, so it's deliberately excluded from
    linting rather than fixed to pass rules it was never written against.
- `docker-compose.yml` at the repo root: Postgres only, per the build prompt
  ("one `docker compose up` brings up Postgres and any dependency" — there is
  no other infra dependency yet; object storage and email are still unbuilt).
- `.github/workflows/ci.yml`: lint → typecheck → test on every push/PR. Not yet
  exercised — this repo has never had a CI run, since pushing was not part of
  this sprint's scope (see Outcome).
- Authentication is injected at the Fastify-instance level
  (`app.decorate("verifySession", ...)`), not hardcoded into `requireAuth` —
  the one deliberate seam that lets tests avoid needing a live Clerk project.
  Everything else in the request pipeline (routing, validation, the database)
  is exercised for real.

## 5. Database Changes

None. `packages/shared`'s schema and migrations are unchanged. One addition to
`packages/shared` itself: `src/db/migrationsPath.ts`, exporting the migrations
folder as an absolute path resolved from the file's own location rather than
`process.cwd()`, so both `packages/shared`'s own migrate script and
`apps/api`'s test suite (which runs from a different working directory) point
at the same folder without relative-path guesswork. `packages/shared`'s
`migrate.ts` was updated to use it; behavior is identical, just no longer
cwd-dependent.

## 6. New Components

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET /healthz` | liveness | none | Not in `openapi.json` — internal ops endpoint, not part of the product API surface |
| `GET /readyz` | readiness | none | Same; returns 503 if the database is unreachable |
| `GET /me` | session | Clerk bearer token | The one endpoint from `packages/shared/openapi.json` implemented this sprint |

New modules: `src/app.ts` (assembles the Fastify instance — the one place used
by both `src/server.ts` and `test/testApp.ts`), `src/env.ts` (Zod config),
`src/errors.ts` (`AppError` and its subclasses), `src/plugins/errorHandler.ts`,
`src/plugins/requestLogging.ts`, `src/auth/verifySession.ts`,
`src/auth/requireAuth.ts`, `src/db.ts`, `src/repositories/accounts.repository.ts`,
`src/services/me.service.ts`, `src/routes/me.route.ts`, `src/routes/health.route.ts`.

## 7. Sprint Test Results

**Automated:** `test/me.integration.test.ts` (3 cases: unauthenticated → 401,
valid session with no matching account → 404, valid session with a matching
account → 200 with the exact expected body) exists, typechecks, and lints
clean, but **could not run in this environment** — Testcontainers needs Docker,
and this environment has none. Running it (`pnpm test` from the repo root, or
in CI once pushed) is unverified and should happen before this sprint's work is
trusted.

**Manual, live verification performed instead** (server actually started and
hit with `curl`, not just typechecked):
- `GET /healthz` with no real database configured → `200 {"status":"ok"}`.
- `GET /readyz` with `DATABASE_URL` pointed at an unreachable Postgres →
  `503 {"status":"not_ready"}` — confirms the readiness check actually queries
  the database rather than always returning ok.
- `GET /me` with no `Authorization` header →
  `401 {"code":"UNAUTHENTICATED","message":"Authentication required"}`.
- `GET /nope` (unknown route) →
  `404 {"code":"NOT_FOUND","message":"No route matches GET /nope"}`.
- Starting the server with `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/
  `DATABASE_URL` all unset → process crashes immediately with a Zod error
  naming exactly which three variables are missing, before attempting to bind
  a port. Confirms the "refuses to start on a missing variable" cross-cutting
  standard.
- Structured JSON log lines were produced for every request above, each
  carrying a `reqId` and, on completion, `method`/`route`/`statusCode`/
  `durationMs` — confirmed by inspecting the actual log output, not assumed
  from the code.

`pnpm typecheck` (both `apps/api` and `packages/shared`): 0 errors.
`pnpm lint` (`apps/api` + `packages/shared`): 0 errors, 0 warnings (2 warnings
found and fixed during this sprint — an unused type import in
`test/testApp.ts` and an unused import in `packages/shared/src/zod/trust.ts`
left over from Sprint 1, since Sprint 1 had no linter yet to catch it).
`apps/web`'s `vite build` re-verified: still succeeds (2142 modules, no change
from Sprint 1).

No invariant-proving test exists yet beyond what Sprint 1 already covers
structurally (append-only triggers, no direct credibility-score write
endpoint) — `GET /me` doesn't touch any Section-1 invariant directly.

## 8. Outcome

**Done:** `apps/api` skeleton (auth, error handler, request-ID/structured
logging, config validation, health/readiness, `GET /me` fully implemented
top-to-bottom), `docker-compose.yml`, `.env.example`, ESLint config, GitHub
Actions CI workflow, one integration test suite (written, typechecked, linted
— not run).

**Not done:**
- The integration test suite has never actually executed. This is the same
  category of gap Sprint 1 had (nothing run against a live Postgres) and it is
  not closed yet.
- CI has never run — the workflow file exists but nothing has been pushed
  since it was added, so it's unverified against GitHub's actual runners.
  (Ubuntu runners do have Docker preinstalled, so `pnpm test`'s Testcontainers
  usage is expected to work there even though it can't be proven here.)
- `packages/anchoring` still does not exist (carried over from Sprint 1,
  unchanged).
- No endpoint besides `GET /me` is implemented. The other 32 endpoints in
  `openapi.json` remain contract-only, exactly as Sprint 1 left them.
- Object storage and transactional email (both named in the build prompt's
  "third-party systems in scope") are not wired up — nothing built this sprint
  needed them yet.

**Blocked on:** nothing structurally, but this sprint's own verification is
incomplete without Docker. Whoever runs this next should, before writing any
more code: `pnpm test` locally (needs Docker) or push and watch CI, and treat a
red run as this sprint's problem to fix, not Sprint 3's.

**Known debt incurred:** the auth-injection seam (`SessionVerifier`) means the
integration test suite has never verified real Clerk token verification end to
end — only that `requireAuth` correctly calls whatever verifier is decorated
onto the instance. A live Clerk project and a real session token would be
needed to close that gap; not attempted this sprint since no Clerk keys were
available. This is a deliberate, bounded scope choice (Section 4), not an
oversight, but it should be repaid with at least one manual smoke test against
a real Clerk project before Sprint 2's auth flow is trusted in anger.

**Next sprint should do first:** get Docker into the loop (locally or via
pushing to trigger CI) and actually run `pnpm test`, then get real Clerk keys
and smoke-test `GET /me` against a live session token, before starting Sprint 3
(the first real feature slice).
