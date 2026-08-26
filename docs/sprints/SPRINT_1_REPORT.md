# Sprint 1 — Contract
**Dates:** 2026-08-26 → 2026-08-26  ·  **Status:** Complete with carryover

## 1. Objective

Produce the full backend contract for SourceIt — database schema, request/response
Zod schemas, a generated `openapi.json`, and a seed script — without writing any
handler or service code, per the build prompt's Phase 1 ("still no implementation").
The objective did not change mid-sprint, but its precondition did: Sprint 0 left 12
open questions and 2 stack proposals unanswered, and none of this sprint's schema
decisions could be made without them, so the sprint opened with the user resolving
all 14 before any schema file was written.

## 2. Changes from Previous Sprint

- All 14 items carried over from Sprint 0 (`docs/OPEN_QUESTIONS.md`'s 12 questions,
  `docs/STACK_PROPOSAL.md`'s 2 proposals) are now resolved. Every one was accepted
  as the recommended option (Railway, Clerk, 3-state anchor badge, separate Dispute
  entity, 3-factor credibility v1, structural reviewer-org-membership COI, publicly
  visible redaction tombstone, publisher rejected state, independent review/anchor
  tracks, all 6 trust statuses, archived evidence snapshots, a minimal admin
  approval queue, drafts freely deletable, pseudonymous review attribution, delete
  the two dead routes, and a public edit-history route). Recorded verbatim in
  `docs/PROJECT_STATE.md` Decisions.
- Two assumptions turned out to need correction mid-sprint, both caught by the
  typechecker/generator rather than left latent:
  - `dispute_status`/`disputeEventTypeSchema` originally included `"open"` as a
    storable event type. `"open"` is a *derived* status (no rows exist yet in
    `dispute_events`), never a value anyone appends — fixed by splitting into
    `disputeEventTypeEnum`/`disputeEventTypeSchema` (4 storable values) and a
    separate `disputeStatusSchema` (5 values, includes `open`) used only for the
    computed `status` field on the `Dispute` response schema. No corresponding DB
    column was ever created with the wrong enum, so this was a pre-commit fix, not
    a migration correction.
  - `sql` was imported from `drizzle-orm/pg-core` instead of `drizzle-orm` in
    `article-versions.ts`, breaking `drizzle-kit generate` outright. Caught
    immediately by the first generate attempt; the file has no other history to
    correct.
- One assumption beyond the resolved 14: no admin UI exists anywhere in the
  frontend (Sprint 0 finding), and the resolved answer to OPEN_QUESTIONS.md #8 only
  says an admin approval queue should exist for reviewers — it doesn't say who
  approves publisher verification. This sprint assumed the same `admin` role
  handles both queues (reviewer approval and publisher verification), rather than
  inventing a second staff role. Flagged here for explicit confirmation rather than
  buried in a schema comment.

## 3. Key Enhancements

Nothing is runnable yet (no handlers exist), so this section describes what the
*contract* now supports, not what a user can do today:

- The full data model for every entity in `docs/DOMAIN.md` plus two the frontend
  never showed (Dispute, Redaction) now has a fixed shape: 18 tables, all
  foreign-keyed, all UUID-keyed, all timestamps UTC.
- Every endpoint the frontend's screens require, plus the endpoints needed to back
  the invariants the frontend has no UI for (admin queues, dispute lifecycle,
  redaction), is defined in `packages/shared/openapi.json` — 33 paths, 39 named
  schemas — with method, path, auth requirement, and response shapes fixed before
  any handler exists.
- A realistic seed dataset (`packages/shared/src/seed/seed.ts`) covering: a
  verified publisher with history and an unverified one; an approved
  (pseudonymous) reviewer and one still pending; a 3-version article with a draft,
  a hash chain, one anchored and one still-pending AnchorRecord, evidence, a
  review, and a dispute with a publisher response — every status this sprint's
  resolved enums define, in at least one row.

## 4. Architecture Changes

- Repo restructured from a single `frontend/` directory into a pnpm workspace per
  the build prompt's Section 3 repo shape: `apps/web` (the frontend, moved
  verbatim), `packages/shared` (new — schema, Zod, OpenAPI generation, seed).
  `apps/api` and `packages/anchoring` are **not** created yet — they have no
  content until Sprint 2 (skeleton) and Sprint 2+ (hashing/Merkle/AnchorProvider)
  respectively, and creating empty scaffold directories now would be speculative.
- `packages/shared` is the single source of truth for types, per build prompt
  ground rule 4: Drizzle schema → migrations, Zod schemas → `openapi.json`. Nothing
  downstream should hand-write a type that exists here.
- New dependency: `@asteasolutions/zod-to-openapi`, to generate `openapi.json` from
  the same Zod schemas used for request/response validation, rather than
  hand-writing or maintaining two parallel definitions (build prompt: "API
  contract: OpenAPI 3.1, generated from the Zod schemas, not written by hand").
- Database-level append-only enforcement: a Postgres trigger
  (`migrations/0001_append_only_triggers.sql`) rejects `UPDATE`/`DELETE` on
  `evidence`, `reviews`, `review_retractions`, `disputes`, `dispute_events`
  unconditionally, and on `article_versions` once `review_status` leaves `draft`.
  This is new infrastructure the build prompt asked for explicitly ("do not rely on
  application code to protect invariants that SQL can protect") — no application
  code exists yet to have relied on instead.
- Review retraction and dispute lifecycle are both modeled as append-only child
  tables (`review_retractions`, `dispute_events`) rather than an `UPDATE` on the
  parent row, so "retracted, with original text intact" and "resolved, never a
  truth verdict" are structurally true, not just documented.

## 5. Database Changes

**`migrations/0000_initial_schema.sql`** — 18 tables, 15 enums, 10 indexes, all
foreign keys and check constraints:

| Table | Purpose | Key constraints |
|---|---|---|
| `accounts` | Base identity, mirrors a Clerk user | unique `clerk_user_id`, `email` |
| `publishers` | Org, mirrors a Clerk Organization | check `transparency_level` 1-5, `credibility_score` 0-100 |
| `publisher_members` | Org membership mirror | composite PK, index on `account_id` (reviewer COI lookup) |
| `credibility_score_history` | Trend sparkline | check `score` 0-100, index `(publisher_id, recorded_at)` |
| `reviewers` | Reviewer profile | unique `account_id` |
| `articles` | Stable container | index `publisher_id` |
| `article_versions` | Append-only, hash-chained history | unique `(article_id, version_major, version_minor)`, check version numbers ≥ 0, self-FK `previous_version_id`, index `article_id` |
| `evidence` | Binds to a version, not an asset | index `article_version_id` |
| `reviews` | Attributed annotation | index `article_version_id` |
| `review_retractions` | Append-only retraction log | unique `review_id` |
| `disputes` | Filing, immutable | index `article_version_id` |
| `dispute_events` | Append-only lifecycle log | index `dispute_id` |
| `anchor_batches` | Merkle-batch anchoring run | — |
| `anchor_records` | Per-version anchor state | unique `article_version_id` |
| `redactions` | Public tombstone | unique `article_version_id` |
| `saved_articles` | Reader bookmark | unique `(account_id, article_id)` |
| `publisher_follows` | Reader follow | unique `(account_id, publisher_id)` |
| `activity_events` | Publisher audit feed | index `(publisher_id, created_at)` |

**`migrations/0001_append_only_triggers.sql`** — two trigger functions
(`reject_update_delete`, `reject_non_draft_update_delete`) and six triggers, listed
in Section 4 above. Not destructive; nothing to roll back that would lose data —
rolling this migration back would only remove the enforcement, not any rows.

Neither migration has been applied to a live database this sprint — no Docker and
no local Postgres were available in this environment. Both were verified by
`drizzle-kit generate` producing valid SQL from the schema with no errors, and by
reading the generated SQL directly (reproduced in review). Actually running them
against Postgres is unverified and should be the first thing Sprint 2 does when
`docker compose up` is wired up.

## 6. New Components

No endpoints are implemented — Sprint 1 is contract-only. `packages/shared/openapi.json`
defines all 33 planned endpoints (method, path, auth, one-line summary each);
none has a route handler yet. Full list by tag:

- **Session** (1): `GET /me`
- **Publishers** (9): create, get, analytics, activity, articles, reviews,
  credibility, credibility-history, plus 2 admin endpoints (pending-verification
  queue, verify/reject)
- **Reviewers** (3): apply, admin pending queue, admin decision
- **Articles** (9): create, get, list versions, get one version, submit new
  version, patch draft version, delete draft version, archive, verification (the
  core public read)
- **Evidence** (2): list, upload
- **Reviews** (3): list, create, retract
- **Disputes** (5): list, file, get one, respond, resolve
- **Redactions** (2): get tombstone, create (admin)
- **Anchor** (1): get anchor record

Layering (`route → validate → service → repository → database`) is specified in
the build prompt but has nothing to show yet — there is no `apps/api` package.

## 7. Sprint Test Results

No automated tests exist yet — Sprint 1 has no application code to test, and the
build prompt does not ask for schema/contract tests at this phase (Vitest +
integration tests start being meaningful once `apps/api` exists in Sprint 2).
Verification performed instead:

- `pnpm exec tsc --noEmit` in `packages/shared`: **0 errors** (schema, Zod, OpenAPI
  generator, seed script all typecheck under strict mode, no `any`).
- `pnpm exec drizzle-kit generate`: succeeded, produced `0000_initial_schema.sql`
  covering 18 tables with the indexes and constraints listed above.
- `pnpm exec tsx src/openapi/generate.ts`: succeeded, produced `openapi.json` with
  33 paths and 39 component schemas.
- `pnpm exec vite build` in `apps/web`: succeeded after two pre-existing frontend
  defects (below) were fixed — 2142 modules transformed, build output produced, no
  errors. This is the frontend's own build, unrelated to backend logic, run only to
  confirm the workspace move didn't break it.
- The seed script (`src/seed/seed.ts`) typechecks and was reviewed but **not run**
  — no live Postgres was available in this environment. It has never executed
  against a real database. This is the single most important gap in this report:
  the seed script is unverified beyond static typechecking.

No invariant from build prompt Section 1 has a passing *test* yet, since there is
no test suite. Three are enforced structurally and can be pointed to directly:
append-only (the two trigger functions, unverified against a live database — see
above), per-asset hash chain (`article_versions.previous_version_id` self-FK +
`previous_hash` column), and "credibility is derived, never written" (no endpoint
in `openapi.json` accepts a `credibilityScore` field on any request body).

## 8. Outcome

**Done:** database schema (18 tables, migrations reviewed and generated but not
live-tested), Zod schemas for every entity and request/response, `openapi.json`
covering all 33 planned endpoints, a seed script (typechecked, not run), all 14
Sprint 0 carryover items resolved and recorded, pnpm workspace restructuring, two
pre-existing frontend defects fixed (see below).

**Not done:**
- No migration has ever been applied to a real Postgres. Sprint 2's `docker
  compose up` is the first point this gets verified.
- The seed script has never been run against a real database.
- `packages/anchoring` (hashing/canonicalization spec, Merkle trees,
  `AnchorProvider` interface) does not exist yet — out of Sprint 1's stated scope,
  but flagged here because Sprint 2/3 will need it soon and the canonicalization
  spec is supposed to be frozen before it's used.
- `apps/api` does not exist. No handler, service, or repository code exists
  anywhere. `packages/shared`'s "Implemented endpoints" table in
  `docs/PROJECT_STATE.md` is still empty by design (Sprint 2 populates it, per the
  build prompt).
- The two dead frontend routes (`/simple-login`, `/reader-portal`) resolved for
  deletion in OPEN_QUESTIONS.md #11 have **not** been deleted yet — that decision
  is recorded, but the deletion is deferred to when the frontend gets wired to the
  real client (Sprint 3+), to keep this sprint scoped to the contract.

**Fixed as a precondition, not part of the planned scope:**
- `apps/web/package.json` (the Figma Make export) contained 54 malformed
  duplicate dependency keys of the form `"pkg@1.2.3": "npm:pkg@1.2.3"` alongside
  the normal `"pkg": "1.2.3"` entry. npm tolerated these; pnpm rejects them outright
  as invalid package names, and they blocked `pnpm install` for the entire
  workspace. Removed the malformed duplicates; the real dependency versions are
  untouched.
- 41 files under `apps/web/src/app/components/ui/` (the shadcn-style component
  library, also Figma Make-exported) had import specifiers with the version
  pinned directly in the string, e.g. `from "sonner@2.0.3"` instead of
  `from "sonner"`. This is not valid for any bundler to resolve and made
  `vite build` fail outright — 44 then a further 23 occurrences were stripped by a
  small mechanical script (regex: strip `@` immediately followed by a semver
  version). No import target, prop, class name, or visual behavior was touched;
  every change is confirmed to be exactly the version suffix.

**Blocked on:** nothing — the resolved answer on the admin-approves-publishers
assumption (Section 2) should be confirmed before Sprint 2 builds the actual
approval endpoint, but nothing in this sprint's deliverables depends on it.

**Debt incurred:** the append-only triggers and every migration in general are
unverified against a live Postgres (repay when Docker/Postgres becomes available —
first action of Sprint 2). The seed script is unverified the same way.

**Sprint 2 should do first:** stand up `docker compose` (Postgres), actually run
both migrations against it, actually run the seed script against it, and confirm
the seeded data round-trips through `packages/shared`'s Zod schemas correctly —
before writing `apps/api` at all. That closes this sprint's biggest unverified gap
before it compounds into Sprint 2.
