# SourceIt — Project State
**Last updated:** end of Sprint 2  ·  **Current phase:** Phase 2 (Skeleton) complete with carryover — Docker-dependent verification still owed before Phase 3

## Resume here

`apps/api` now runs: `GET /me` is fully implemented and was verified live
(server started, hit with `curl`) for every case except an actual database
round-trip and an actual Clerk session — neither was possible in this
environment (no Docker, no live Clerk project). Before Sprint 3 (the first
feature slice) starts, read [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md)
Section 8: `pnpm test` (Testcontainers-based, needs Docker) has never actually
run, and neither has CI. Run both — or push and watch CI run them — before
trusting the repository layer or the auth flow.

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Read the frontend; produce domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |

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

`packages/shared/openapi.json` defines the full contract (33 endpoints); 1 of them
is implemented so far. `GET /healthz` and `GET /readyz` also exist but are
intentionally not in `openapi.json` — ops endpoints, not product API surface.

| Method | Path | Auth | Sprint introduced |
|---|---|---|---|
| GET | /me | Clerk bearer token | 2 |

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

## Open questions

None outstanding.

## Known debt and deviations

- **Migrations still never run against a live database**, and now neither has
  the integration test suite (Testcontainers) or CI — all three need Docker,
  which has not been available in this environment across two sprints running.
  `pnpm test` and a real `docker compose up` + apply-migrations pass are both
  still owed. Repay: before Sprint 3 starts, per SPRINT_2_REPORT.md Section 8.
- **Seed script never run.** Unchanged from Sprint 1 — same underlying cause.
- **Auth flow never tested against a real Clerk project.** The injected
  `SessionVerifier` (see Decisions above) means `requireAuth`'s wiring is
  proven, but real `verifyToken` behavior against a real Clerk-issued JWT is
  not. Repay: one manual smoke test against a live Clerk project once keys
  exist, before relying on the auth flow for anything real.
- **CI has never run.** The workflow file exists and was reviewed but nothing
  has been pushed since it was added.
- **`packages/anchoring` does not exist.** Unchanged from Sprint 1 — the
  canonicalization spec still needs to be frozen before Sprint 3's central-entity
  slice can compute real `contentHash` values.
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, despite
  being confirmed dead. Unchanged from Sprint 1 — still deferred to Sprint 3+.
- **Fixed but worth tracking (Sprint 1):** `apps/web/package.json` had 54
  malformed duplicate dependency keys (Figma Make export artifact) that blocked
  `pnpm install`; removed. 41 files under `apps/web/src/app/components/ui/` had
  version-pinned import specifiers that blocked `vite build`; stripped
  mechanically. Neither touched visual or behavioral code — see
  SPRINT_1_REPORT.md Section 8.

## How to run

Confirmed working this sprint:

```
pnpm install                                   # workspace install — verified
pnpm typecheck                                 # apps/api + packages/shared — verified, 0 errors
pnpm lint                                      # apps/api + packages/shared — verified, 0 errors/warnings
docker compose up                              # brings up local Postgres — compose file reviewed,
                                                # not actually run (no Docker in this environment)
```

`apps/api` was started directly (`pnpm exec tsx src/server.ts`, dummy env vars) and
verified live: `GET /healthz` → 200, `GET /readyz` → 503 when the database is
unreachable (confirms it actually checks), `GET /me` with no auth header → 401,
an unknown route → 404 — all in the standard error envelope, all logged as
structured JSON with a request id. Starting the server with required env vars
unset crashes immediately with a Zod error naming exactly what's missing.

Not yet possible here: `pnpm test` (Testcontainers needs Docker), applying
migrations to a real Postgres, running the seed script, or exercising `GET /me`
against a real Clerk session and a real database row at the same time.
