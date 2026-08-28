# Sprint 3 — One Vertical Slice (Article)
**Dates:** 2026-08-27 → 2026-08-27  ·  **Status:** Complete with carryover

## 1. Objective

Build Article — "the one the product is named after," the central information
asset every other entity attaches to — completely: create, read, list with
pagination, correct (update via new version), and archive, with real
authorization and real content hashing, per the build prompt's Phase 3. Then
wire the real generated client into the real frontend screens, delete their
mock data where the backend can back it, and demonstrate the slice working in
the browser.

The objective was fully met, including the part that looked blocked partway
through the sprint. Two decisions genuinely needed the user's input — how
Clerk's auth UI should integrate with the existing custom login forms, and how
a reader is meant to arrive at a specific article — and once those came back,
both were implemented and the whole slice was demonstrated live: a real
sign-up-free login against a real Clerk project, a real article published
through the real UI, and a real public verification page rendering that
article's real data, all against a real (if temporary) Postgres database.

## 2. Changes from Previous Sprint

- **The single biggest carryover from Sprints 1 and 2 — migrations and the
  seed script never verified against a live Postgres — is now closed.** No
  Docker was available in this environment across three sprints running, so
  this sprint used `embedded-postgres` (an npm package that runs a real
  Postgres binary directly, no Docker) as a one-time local verification aid.
  This is not a project dependency — nothing in `package.json` references it —
  it was installed in a scratch directory outside the repo and torn down at
  the end of the sprint, along with a real Clerk test user created for the
  live demo and deleted afterward. See Section 7 for what that verification
  found.
- **Two real, serious bugs were caught by live verification and are now
  fixed**, neither of which a typecheck or a mocked test could have caught:
  - `reject_non_draft_update_delete()` (the append-only trigger from Sprint 1)
    was silently suppressing *every* row's UPDATE/DELETE, not just the ones it
    was supposed to block. Section 5 has the full story.
  - `apps/api` had no CORS support at all. Every authenticated browser
    request's preflight `OPTIONS` request 404'd, so the browser silently
    blocked the real request before it was ever sent — invisible to `curl`
    (which skips CORS entirely) and invisible to the integration test suite
    (which calls the Fastify instance in-process, no real browser involved).
    This was only caught once the app was actually driven from a real browser.
    Fixed by registering `@fastify/cors` (Section 4).
- Two smaller Sprint 1 contract gaps were found and fixed while implementing
  against them: `createArticleRequestSchema` was missing `publisherId` (an
  account can belong to more than one publisher, so the target can't be
  inferred), and `articleVersionSummarySchema` was missing
  `articleId`/`category`, which `GET /publishers/{id}/articles` needs to
  actually back `MyArticlesTable.tsx`'s columns. Both documented inline in
  `packages/shared/src/zod/articles.ts`.
- `packages/anchoring` — flagged as debt at the end of Sprint 2 — now exists.
  See Section 4 and `docs/CANONICALIZATION.md`.
- The frontend is now wired for the parts the backend can back: login,
  publishing, the publisher's article list, archiving, and public
  verification of a specific article. Mock data was **not** deleted wholesale
  — see Section 8 for exactly what's still mocked and why.

## 3. Key Enhancements

Everything below was exercised for real, in a real browser, this sprint (see
Section 7's live-demo walkthrough) — not just implemented and typechecked:

- A publisher's member can sign in with a real Clerk-issued session (email +
  password, plus a second factor when the Clerk instance requires one) using
  the existing custom login form — no visual change, real auth underneath.
- A verified publisher's member can publish an article through the real
  `PublishArticlePanel` form; a real SHA-256 content hash is computed and
  stored in a real database the moment it's submitted.
- That publisher's real article list (`MyArticlesTable`) shows the real,
  live article — draft or published — with working "View Article" (links to
  the real public verification page) and "Archive Article" (calls the real
  endpoint and removes the row) actions.
- Anyone, signed in or not, can open `/verification-result/:articleId` and see
  that article's real headline and real version history, computed from
  `GET /articles/{id}` and `GET /articles/{id}/versions` — no mock data for
  those two facts, regardless of whether the visitor is authenticated.
- Submitting a correction chains a real `previousHash` to the prior version's
  real `contentHash`, and the version list reflects it immediately.
- Archiving an article removes it from `GET /articles/{id}` (a 404) and from
  the owner's article list, without touching the append-only version rows
  underneath.

## 4. Architecture Changes

- **New package: `packages/anchoring`.** Zero runtime dependencies, usable
  standalone, per the build prompt. `canonicalStringify` (deterministic JSON:
  keys sorted recursively, arrays left in order) and `hashVersionContent`
  (SHA-256 over the canonical form via Web Crypto's `crypto.subtle`, not
  `node:crypto` — chosen specifically so the identical code runs unmodified in
  a browser). The exact field list and algorithm are frozen in
  `docs/CANONICALIZATION.md`; changing either is a new spec version, not a
  bugfix.
- **New: `apps/api`'s authorization layer** (`src/auth/can.ts`) — the single
  `can(actor, action)` function the cross-cutting standard calls for, backed
  by `src/repositories/publishers.repository.ts`'s `isMember`/`isVerified`.
  Every article-writing route calls `assertCan` before touching the database.
- **New: `src/auth/requireActor.ts`**, sitting in front of `can()`. It
  resolves a verified Clerk session down to a local `accounts` row
  (`{accountId}`); a valid Clerk session with no matching local account is
  treated as unauthenticated. `resolveOptionalActor` is the same resolution
  without throwing, for the one route (`GET .../versions/:versionId`) that's
  public but behaves differently for an authenticated owner.
- **New: CORS support** (`@fastify/cors`, registered in `src/app.ts`), gated
  by a new `CORS_ORIGIN` env var — comma-separated allowed origins outside
  development, any origin allowed in development for convenience. Found
  missing only by driving the app from a real browser (Section 2).
- **New dependency: `openapi-typescript` + `openapi-fetch`** in
  `packages/shared`, generating a typed client from `openapi.json`. Exposed as
  a separate `@sourceit/shared/client` subpath export — isolated from the
  package's root export (which pulls in Drizzle/`pg`/Node's `node:url` and
  would break if bundled for a browser). `@sourceit/shared/client` has no
  Node-only dependency and is imported directly from `apps/web`.
- **New in `apps/web`**: `@clerk/clerk-react` + `ClerkProvider` (`App.tsx`);
  `src/app/lib/apiClient.ts` (`useApiClient()` hook wrapping the generated
  client with Clerk's `getToken`, plus a `publicApiClient` for call sites that
  don't need auth context); a `vite-env.d.ts` for `import.meta.env` typing
  (didn't exist before — `apps/web` has no `tsconfig.json` at all, a
  pre-existing gap from the Figma Make export, so nothing in this app has ever
  been typechecked by its own build; verification for every file this sprint
  touched used an ad-hoc `tsc` invocation with explicit compiler flags instead
  — see Section 7).
- `LoginForm.tsx` handles Clerk's `needs_second_factor` status (an
  email-code step) when the Clerk instance's own security policy requires it
  — discovered live during the demo, not anticipated in advance; the UI for it
  is a single code-input step reusing the same card, not a redesign.
- `/verification-result` keeps its original param-less route (for the
  existing mock entry points — `VerificationHero`'s search/scan tabs,
  `RecentlyVerified`, `SavedArticles` — none of which have a real article id
  to navigate with, since there's no backend search endpoint) alongside a new
  `/verification-result/:articleId` route that fetches real data. Same
  component, branches on whether `articleId` is present.
- **`apps/api/test/testApp.ts` gained a `TEST_DATABASE_URL` escape hatch**:
  when set, integration tests connect to a real, already-running Postgres
  instead of starting a Testcontainers container, resetting both the `public`
  schema and Drizzle's own migration-tracking schema first. Real feature for
  Docker-less environments, not a one-off hack — Testcontainers remains the
  default. Has a real constraint (single-file-at-a-time; documented in a code
  comment) that Testcontainers doesn't share.
- `apps/api`'s `tsconfig.json` now includes `test/` in typechecking — it
  didn't before, meaning Sprint 2's own test files were never actually
  typechecked by `pnpm typecheck` despite that sprint's report claiming 0
  errors. That claim was true only for `src/`; caught and fixed this sprint.

## 5. Database Changes

**`migrations/0002_add_article_archived_at.sql`** — adds
`articles.archived_at timestamptz`, nullable. Backs the archive endpoint.

**`migrations/0003_fix_append_only_error_message.sql`** — cosmetic:
`reject_non_draft_update_delete()`'s error message used `%s` (Postgres's
`RAISE` format only recognizes bare `%`; `%s` produced literal text like "a
verifieds version"). Text only, no behavior change.

**`migrations/0004_fix_append_only_trigger_silently_blocking_drafts.sql`** —
**the important one.** `reject_non_draft_update_delete()` is a `FOR EACH ROW
BEFORE` trigger. For that trigger type, Postgres treats a `NULL` return as an
instruction to *skip the write for that row* — not a generic "no-op, nothing
to report" return. The Sprint 1 version of this function fell through to
`RETURN NULL` after its `IF` block regardless of outcome, which meant it
silently discarded every UPDATE and DELETE on `article_versions`, including
the draft rows the invariant explicitly requires to stay freely editable. No
exception was ever raised, so a check that only asked "did this throw?"
reported success; the bug only showed up once this sprint checked `rowCount`
directly (0, when 1 was expected). There is no data-loss risk from having
shipped this — it was too strict, not too permissive — but every
draft-editing endpoint would have silently failed to persist anything until
this fix. **This is exactly the kind of bug that passes typecheck, passes a
naive smoke test, and only surfaces under real, careful use.**

All four migrations were applied to a real Postgres and their intended
behavior was re-verified directly with `pg` after each fix: draft UPDATE/DELETE
report `rowCount: 1` and actually persist; non-draft UPDATE/DELETE are still
rejected with the corrected message.

## 6. New Components

Newly implemented (of the 33 planned in `openapi.json`, 9 now work):

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /me | Clerk bearer | Sprint 2, exercised live again this sprint |
| POST | /articles | Clerk bearer | Creates article + v1.0; draft or submitted |
| GET | /articles/{articleId} | public | 404s if archived |
| GET | /articles/{articleId}/versions | public | Excludes drafts |
| GET | /articles/{articleId}/versions/{versionId} | public + optional owner | Draft → 404 unless owner |
| POST | /articles/{articleId}/versions | Clerk bearer | Correction; requires a published version to correct |
| PATCH | /articles/{articleId}/versions/{versionId} | Clerk bearer | Draft only, 409 otherwise |
| DELETE | /articles/{articleId}/versions/{versionId} | Clerk bearer | Draft only, 409 otherwise |
| POST | /articles/{articleId}/archive | Clerk bearer | Any lifecycle stage |
| GET | /publishers/{publisherId}/articles | Clerk bearer | Paginated, owner-only |

Layering: `src/routes/articles.route.ts` + `publisherArticles.route.ts` →
`src/services/articles.service.ts` → `src/repositories/articles.repository.ts`
+ `publishers.repository.ts` → Postgres. No SQL in the service layer, no
business logic in the routes.

Frontend components wired to real data/calls this sprint: `LoginForm.tsx`,
`PublishArticlePanel.tsx`, `MyArticlesTable.tsx`, `PublisherPortal.tsx` (fetches
`/me` to resolve the current publisher id), `VerificationResult.tsx` +
`VersionHistory.tsx`.

## 7. Sprint Test Results

**`packages/anchoring`**: 13/13 tests pass — determinism, field-order
independence, and one case per field proving a change to that field changes
the hash.

**`apps/api`**: 21/21 tests pass, run for real against a live database.
- `test/me.integration.test.ts`: 3/3.
- `test/articles.integration.test.ts`: 18/18 — unauthenticated (401),
  validation failure (400), authenticated-but-unauthorized (403, twice — not a
  member, and submit-on-unverified), happy path create (draft and submitted),
  public read of a published article and its versions, not-found (404),
  hash-chain correctness on a correction (asserted byte-for-byte), archive
  hiding an article from public reads, a draft invisible to the public (404)
  but visible to its own publisher (200), PATCH/DELETE on a draft, PATCH
  409-ing once no longer a draft, and org isolation on the publisher article
  list.
- Run via the `TEST_DATABASE_URL` escape hatch against `embedded-postgres`,
  one file at a time. One test bug was found and fixed in the process (a PATCH
  test sent a body shaped for the wrong Zod schema) — a test defect, confirmed
  by the identical PATCH call behaving correctly with a correctly-shaped body
  in manual verification.
- **Not run in CI** — nothing has been pushed since these tests were written.

`pnpm typecheck`, `pnpm lint`: 0 errors across `apps/api`, `packages/shared`,
`packages/anchoring`. `apps/web` has no `tsconfig.json` (pre-existing gap, not
introduced this sprint) so `vite build` (2204 modules, succeeds) is its only
standing verification; every file this sprint touched or added was
additionally typechecked with an ad-hoc `tsc --noEmit` invocation (explicit
`--jsx`/`--module`/`--moduleResolution` flags standing in for a missing
config) and came back clean.

**Live browser demonstration — the actual "does it work in the browser"
proof, not just automated tests:**
1. Set up `embedded-postgres`, applied all 5 migrations, ran the seed script.
2. Created a real Clerk user via the Backend API and linked its Clerk user id
   to the seeded "Daily Planet News" publisher owner's `accounts` row.
3. Started `apps/api` and `apps/web`'s real dev servers, opened the app in an
   actual Chrome tab (via browser automation), and:
   - Logged in with real credentials through the unmodified `LoginForm` UI.
     Clerk's own security policy required a second factor; the app correctly
     showed a code-entry step, and (using Clerk's documented `+clerk_test`
     testing convention) the sign-in completed with a real, active Clerk
     session — confirmed by inspecting `window.Clerk.session` directly.
   - This is where the CORS gap (Section 2) was caught: the real request
     silently failed in-browser despite every prior curl/test check passing.
     Fixed, confirmed fixed by re-running the same flow.
   - Landed on the real `/publisher-portal`, which correctly showed the
     seeded draft article fetched live from `GET /publishers/{id}/articles`.
   - Filled out and submitted `PublishArticlePanel`'s real form. Server log
     confirmed a real `POST /articles` → `201`; the database confirmed a new
     `articles`/`article_versions` row with a real 64-character SHA-256
     `content_hash`.
   - Navigated to that article's real, public `/verification-result/:id` page
     (no login) and confirmed the header subtitle and the Version History card
     both rendered the real headline, real `v1.0` label, and real published
     timestamp — everything else on that page (trust summary, evidence,
     publisher credibility, reviewer notes) correctly still shows mock data,
     since the backend that would compute it doesn't exist yet (Section 8).
4. Deleted the real Clerk demo user and tore down `embedded-postgres`
   afterward — nothing from this demo persists outside this report.

## 8. Outcome

**Done and verified live in a real browser, not just typechecked or curled:**
the full Article backend vertical slice, plus real Clerk login (including a
second-factor step neither anticipated nor skipped), real article publishing
through the real UI, the real publisher article list, and the real public
verification page for a specific article's headline and version history.
`packages/anchoring` exists and is tested. The generated `@sourceit/shared/client`
was exercised for real, from a real browser, not just against `curl`.

**Explicitly still mock, and why:**
- `RegisterForm.tsx` (creating a brand-new account through the UI) — doing
  this for real needs a local-account-provisioning endpoint that doesn't
  exist yet (today, an `accounts` row only ever comes from the seed script),
  plus real route handlers for `POST /publishers` and `POST /reviewers/apply`
  (both are in `openapi.json` from Sprint 1 but have no `apps/api` handler).
  Out of scope for the Article slice specifically; flagged rather than
  half-built.
- Everything on `/verification-result` except the headline and version
  history — trust status, evidence, publisher credibility, reviewer notes —
  since `GET /articles/{id}/verification` needs Evidence, Review, and Dispute
  data that don't exist yet. Correctly deferred, not an oversight.
- `VerificationHero`'s search/scan tabs, `RecentlyVerified`, `SavedArticles` —
  no backend search endpoint exists to look up an article by text/URL/scan, so
  these still navigate to the param-less mock route.
- `MyArticlesTable`'s "Edit Article," "View Blockchain Proof," and "Manage
  Media & Evidence" actions remain stubs — no version-edit-in-place UI,
  anchor-status read endpoint wiring, or evidence upload UI was built this
  sprint (the backend for the first exists via PATCH; the other two need
  endpoints not yet implemented/wired).

**Known debt incurred:**
- `apps/web` still has no `tsconfig.json` — a pre-existing gap, not
  introduced this sprint, but now more consequential since real application
  logic (not just mock UI) lives in files nothing typechecks automatically.
  Repay: add one, or accept ad-hoc `tsc` invocations as the standing practice
  and say so explicitly (currently implicit).
- The `TEST_DATABASE_URL` escape hatch's single-file-parallelism constraint is
  real and only documented in a code comment, not enforced by tooling.
- `GET /articles/{id}/verification` (the composed trust-status endpoint) is
  still entirely unbuilt.
- No endpoint from this sprint has ever been exercised in CI — nothing has
  been pushed since Sprint 2 added the workflow.
- Publisher/reviewer account provisioning (`RegisterForm`'s real backend) is
  unbuilt, as detailed above.

**Blocked on:** nothing. Both decisions that blocked this sprint mid-way were
answered and acted on.

**Next sprint should do first:** either build the Evidence/Review/Dispute
slices that `GET /articles/{id}/verification` depends on, or build account
provisioning (`POST /publishers`, `POST /reviewers/apply`, and whatever local
`accounts`-row creation `RegisterForm` needs) so a brand-new user can sign up
for real instead of only existing seeded/manually-linked accounts being able
to log in. Either way: push to GitHub and confirm CI actually goes green
before trusting Testcontainers-based tests any further than this sprint's
manual substitute proved they should work.
