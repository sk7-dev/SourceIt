# SourceIt — Project State
**Last updated:** end of Sprint 3  ·  **Current phase:** Phase 3 (Article vertical slice) — complete, verified live end-to-end in a real browser

## Resume here

The Article vertical slice — backend **and** frontend — is done and was
demonstrated live: real Clerk login (including a second-factor step Clerk's
own instance required), a real article published through the real
`PublishArticlePanel` UI, and that article's real headline and version history
rendering on its real public `/verification-result/:articleId` page — all
against a real (temporary) Postgres. See
[SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) Section 7 for the full
walkthrough. Two real bugs were only caught by that live run: the Sprint 1
append-only trigger was silently discarding every write (Section 5), and
`apps/api` had no CORS support at all, so every authenticated browser request
was silently blocked by a failed preflight — invisible to `curl` and to the
in-process integration tests, only visible from an actual browser. Both fixed.

Still mock, deliberately: `RegisterForm` (needs new account-provisioning
endpoints), everything on `/verification-result` except headline/version
history (needs Evidence/Review/Dispute data), and the search/scan entry points
(no backend search endpoint exists). See SPRINT_3_REPORT.md Section 8 for the
full list.

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Read the frontend; produce domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |
| 3 | Article vertical slice: full backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree (Sprint 0's model was frontend-only
inference; this is the actual schema in `packages/shared/src/db/schema/`). 18 tables:

```
Account ──has role──> reader | publisher | reviewer | admin
  (mirrors a Clerk user; role-specific profile lives in Reviewer or PublisherMember)

Publisher ──mirrors──> Clerk Organization
Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership, also the
                                                            reviewer-COI join table]
Publisher (1) ──has──> (N) CredibilityScoreHistory point
Publisher (1) ──publishes──> (N) Article

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained
                                              via previousVersionId/previousHash]
ArticleVersion (1) ──has──> (N) Evidence          [binds to version, not article]
ArticleVersion (1) ──has──> (1) AnchorRecord      [pending/anchored/anchor_failed,
                                                    always present once submitted]
ArticleVersion (1) ──has──> (0..1) Redaction      [public tombstone, if redacted]
ArticleVersion (1) ──has──> (N) Review            [append-only; retraction = a
                                                    ReviewRetraction row, never an
                                                    UPDATE]
ArticleVersion (1) ──has──> (N) Dispute           [separate entity, own lifecycle]
Dispute        (1) ──has──> (N) DisputeEvent      [append-only lifecycle log;
                                                    current status = latest event,
                                                    or "open" if none]

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute

Account(reader) ──saves───> (N) SavedArticle ──> Article
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher

Publisher (1) ──has──> (N) ActivityEvent     [audit-trail feed]
AnchorBatch (1) ──has──> (N) AnchorRecord    [batched Merkle anchoring]
```

TrustStatus (6 values: authentic, authentic_under_review, updated, disputed,
publisher_unverified, notfound) is **not a table** — computed at read time by
`GET /articles/{id}/verification`, per docs/DOMAIN.md #12.

## Implemented endpoints

`packages/shared/openapi.json` defines the full contract (33 endpoints); 9 of
them are implemented so far, all verified against a real database this sprint.
`GET /healthz` and `GET /readyz` also exist but are intentionally not in
`openapi.json` — ops endpoints, not product API surface.

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
  this is a hard invariant, not a preference.
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
  submission time, not merely linked (`evidence.isArchivedSnapshot`,
  `evidence.sourceUrl`). Why: verification must not silently degrade when a
  third-party URL rots. Revisit: if archival storage cost becomes material at
  scale, which is not expected at year-one volume.
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
  Revisit: never without a change to the accountability requirement.
- 2026-08-26 — `/simple-login` and `/reader-portal` are confirmed dead and slated
  for deletion; the rest of the sidebar's unwired local state is left alone
  (single-scrolling-page layout is intentional, not a bug). Why: user confirmed
  both routes are unreachable/duplicate. **Not yet executed** — deferred to
  Sprint 3+ when the frontend is wired to the real client, to keep Sprint 1 scoped
  to the contract. See SPRINT_1_REPORT.md Section 8.
- 2026-08-26 — `/article-edit-history`'s full version-history data gets a second,
  public, unauthenticated route (`GET /articles/{id}/versions`,
  `GET /articles/{id}/versions/{versionId}`) alongside the existing authenticated
  publisher route. Why: build prompt requires version history to be public like
  verification itself; user confirmed both routes should exist rather than
  replacing the authenticated one. Revisit: never without a requirement change.
- 2026-08-26 — Schema entity names (Article, ArticleVersion, Publisher, Reviewer,
  Dispute, DisputeEvent, Redaction, AnchorRecord, Evidence, etc.) confirmed at the
  Sprint 1 stop point as matching the business's own language — no renames.
- 2026-08-26 — Session auth is a Clerk-issued JWT passed as an `Authorization:
  Bearer <token>` header, verified server-side with `@clerk/backend`'s
  `verifyToken`. Why: the concrete mechanism Sprint 1's `security: authed` tag
  needed; Clerk's own recommended server-side verification path, no custom
  session/cookie handling. Revisit: never without dropping Clerk itself.
- 2026-08-26 — `apps/api`'s Fastify instance takes an injectable
  `SessionVerifier` (`app.decorate("verifySession", ...)`); production always
  uses real Clerk verification, but the integration test suite substitutes a
  fixed token→clerkUserId mapping instead of requiring a live Clerk project to
  run. The database is never substituted this way — Testcontainers Postgres,
  real migrations, always. Why: a live Clerk project wasn't available this
  sprint, and hand-rolling fake JWTs that pass real Clerk verification isn't
  possible without Clerk's own signing keys; injecting at the verification
  boundary was the option that still exercises everything else (routing,
  errors, the database) for real. Revisit: add a second, smaller test suite
  against a real Clerk test project once one exists, rather than trusting the
  injected path alone forever.

- 2026-08-27 — `packages/anchoring`'s canonicalization/hashing spec is frozen
  as of Sprint 3 (`docs/CANONICALIZATION.md`): SHA-256 over a deterministic,
  recursively-key-sorted JSON serialization of exactly 8 version-content
  fields, computed via Web Crypto (`crypto.subtle`) rather than `node:crypto`
  so the identical code runs in a browser. Why: the build prompt requires this
  frozen before Phase 1, and it slipped to Sprint 3 because nothing needed a
  real hash before then — flagged rather than pretended otherwise. Revisit:
  never without a new spec version, since any change invalidates every
  previously-computed hash.
- 2026-08-27 — Session verification is injected at the Fastify-instance level
  (`SessionVerifier`) and the article integration tests use a fixed
  token→clerkUserId mapping rather than a live Clerk project — carried over
  from Sprint 2's same decision, now exercised by 18 more tests.
- 2026-08-27 — **Confirmed at the Sprint 3 mid-sprint stop point:** Clerk's
  auth UI is wired via headless hooks into the existing custom
  `LoginForm`/`RegisterForm` (no visual change), and a reader reaches a
  specific article via a route param (`/verification-result/:articleId`). Both
  implemented and demonstrated live this sprint. `RegisterForm` itself is
  still unwired — the confirmed *approach* (headless hooks) applies once its
  supporting backend endpoints exist (see Known debt).
- 2026-08-27 — `apps/api` gets CORS via `@fastify/cors`, origin controlled by
  a new `CORS_ORIGIN` env var (comma-separated allowlist outside development;
  any origin allowed in development). Why: found live — every authenticated
  browser request's preflight `OPTIONS` 404'd with no CORS plugin registered,
  invisible to curl/in-process tests. Revisit: set `CORS_ORIGIN` explicitly
  before any non-development deployment; the development-allows-any-origin
  default must never apply outside development.
- 2026-08-27 — `apps/web`'s auth UI additionally handles Clerk's
  `needs_second_factor` sign-in status (an email-code step) inline in
  `LoginForm`, discovered live when this Clerk project's own security policy
  required it for a password sign-in. Why: the alternative was leaving a
  real, reachable Clerk state with no UI to complete it. Revisit: never,
  unless Clerk's second-factor strategy set changes.

## Open questions

None outstanding.

## Known debt and deviations

- **Docker itself is still never available in this environment**, across
  three sprints. `docker compose up` and the Testcontainers-based test runs
  remain unverified *by this environment specifically* — but everything that
  actually mattered (migrations, the seed script, the append-only trigger, all
  9 implemented endpoints, and now the full frontend flow) was verified for
  real this sprint via `embedded-postgres` (a scratch, non-project dependency)
  and a real, temporary Clerk user, both torn down afterward. What's left:
  confirm CI actually goes green on GitHub's Docker-equipped runners once
  something is pushed, and confirm `docker compose up` specifically works —
  nobody has typed that exact command against this repo yet.
- **CI has never run.** Unchanged — the workflow file exists and was reviewed,
  nothing has been pushed since Sprint 2 added it.
- **`RegisterForm.tsx` still unwired.** Creating a brand-new account through
  the UI needs a local-account-provisioning endpoint that doesn't exist (today
  an `accounts` row only comes from the seed script or manual linking) plus
  real handlers for `POST /publishers` and `POST /reviewers/apply` (both are
  in `openapi.json` from Sprint 1, neither has an `apps/api` route). The
  *approach* for wiring it (Clerk headless hooks, matching `LoginForm`) is
  confirmed; the backend it needs is not built.
- **`GET /articles/{id}/verification` (the composed trust-status endpoint)
  does not exist.** Correctly deferred — it needs Evidence, Review, and
  Dispute data, none of which exist yet. Most of `/verification-result` still
  shows mock data because of this, not because it wasn't wired.
- **No backend search endpoint** — `VerificationHero`'s search/scan tabs,
  `RecentlyVerified`, and `SavedArticles` still navigate to the param-less
  mock verification route, since there's no way to look up an article by
  text/URL/scan yet.
- **`apps/web` has no `tsconfig.json`.** Pre-existing gap (Figma Make export),
  not introduced this sprint, but more consequential now that real
  application logic lives in these files — nothing typechecks them
  automatically as part of `vite build`. Every file touched this sprint was
  typechecked ad-hoc instead (explicit `tsc` flags standing in for a missing
  config). Repay: add a real `tsconfig.json`, or keep doing ad-hoc checks
  deliberately and say so.
- **The `TEST_DATABASE_URL` test escape hatch is single-file-parallelism only**,
  enforced by a code comment, not tooling. Using it for more than one test file
  at a time without `--no-file-parallelism`-equivalent care will race.
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, despite
  being confirmed dead since Sprint 1. Still deferred — nothing this sprint
  touched them.
- **Fixed but worth tracking (Sprint 1):** `apps/web/package.json` had 54
  malformed duplicate dependency keys (Figma Make export artifact) that blocked
  `pnpm install`; removed. 41 files under `apps/web/src/app/components/ui/` had
  version-pinned import specifiers that blocked `vite build`; stripped
  mechanically. Neither touched visual or behavioral code — see
  SPRINT_1_REPORT.md Section 8.
- **Fixed and important (Sprint 3):** the Sprint 1 append-only trigger was
  silently discarding every write, not just the ones it meant to block, and
  `apps/api` had no CORS support at all (every authenticated browser request
  silently failed preflight) — see SPRINT_3_REPORT.md Sections 2 and 5. Both
  fixed. Neither was catchable by typecheck, curl, or the in-process
  integration test suite — only a real browser driving the real app surfaced
  them. Worth remembering before declaring any future sprint done on the
  strength of automated tests alone.

## How to run

Confirmed working this sprint (against a real Postgres, not Docker's — and,
for the frontend, a real Chrome browser):

```
pnpm install                                   # workspace install — verified
pnpm typecheck                                 # apps/api + packages/shared + packages/anchoring — 0 errors
pnpm lint                                      # same three — 0 errors/warnings
pnpm --filter @sourceit/shared db:migrate      # applies all 5 migrations for real — verified
pnpm --filter @sourceit/shared seed            # verified against a real database
pnpm --filter @sourceit/anchoring test         # 13/13 — verified
TEST_DATABASE_URL=<url> pnpm exec vitest run test/me.integration.test.ts        # 3/3 — verified
TEST_DATABASE_URL=<url> pnpm exec vitest run test/articles.integration.test.ts  # 18/18 — verified
pnpm --filter @sourceit/api dev                # needs .env (DATABASE_URL, CLERK_*, CORS_ORIGIN) — verified
pnpm --filter @sourceit/web dev                # needs apps/web/.env.local (VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL) — verified
```

(The two `TEST_DATABASE_URL` runs need `--no-file-parallelism`-equivalent care
if run together — see Known debt above; run one file at a time as shown.)

Live-verified in an actual browser this sprint (see SPRINT_3_REPORT.md
Section 7 for the full walkthrough): real Clerk login with a second-factor
step, publishing an article through the real UI, that article appearing in
the real publisher article list, and its real headline/version history
rendering on its public verification page.

Still not possible here: `docker compose up` specifically, or Testcontainers
(both need Docker, unavailable in this environment).
