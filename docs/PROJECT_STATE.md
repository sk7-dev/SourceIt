# SourceIt — Project State
**Last updated:** end of Sprint 1  ·  **Current phase:** Phase 1 (Contract) complete and confirmed — ready for Phase 2 (Skeleton)

## Resume here

The full backend contract exists: 18-table Postgres schema (`packages/shared/migrations`),
Zod request/response schemas, and a generated `packages/shared/openapi.json` (33
endpoints). No handler, service, or repository code exists anywhere — `apps/api`
has not been created. Before Sprint 2 (Skeleton) starts, read
[SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) Section 8 in full: the schema and
`openapi.json` have never been run against a live Postgres in this environment, and
that verification (`docker compose up`, apply both migrations, run the seed
script) should be Sprint 2's first action, before any new code is written.

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Read the frontend; produce domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |

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

None yet. `packages/shared/openapi.json` defines the full contract (33 endpoints);
this table starts being populated in Sprint 2 with `GET /me`, and must always match
`openapi.json` once code exists — if it doesn't, that's a bug in the code, not the doc.

| Method | Path | Auth | Sprint introduced |
|---|---|---|---|

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

## Open questions

None outstanding. All 12 from Sprint 0 plus both stack proposals were resolved
2026-08-26; the sprint's own new question (does one `admin` role approve both
reviewers and publishers?) was confirmed "yes" the same day, at the Sprint 1 stop
point, alongside confirming the schema's entity names need no renames.

## Known debt and deviations

- **Migrations never run against a live database.** No Docker or local Postgres
  was available in this Sprint 1 environment. `drizzle-kit generate` succeeded and
  the SQL was reviewed, but neither migration has ever executed against real
  Postgres. Repay: first action of Sprint 2, before writing `apps/api`.
- **Seed script never run.** Same cause. Typechecks cleanly; behavior against a
  real database (foreign key ordering, returned-row shapes) is unverified. Repay:
  same as above.
- **`packages/anchoring` does not exist.** The build prompt calls for hashing,
  canonicalization, Merkle trees, and an `AnchorProvider` interface to live there,
  usable standalone. Not part of Sprint 1's stated scope (Contract), but the
  canonicalization spec needs to be frozen before Sprint 3's central-entity slice
  can compute real `contentHash` values. Repay: Sprint 2 or the start of Sprint 3,
  whichever needs it first.
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, despite being
  confirmed dead. Repay: Sprint 3+, when the frontend is wired to the real
  generated client and mock data starts getting deleted anyway.
- **Fixed but worth tracking:** `apps/web/package.json` had 54 malformed duplicate
  dependency keys (Figma Make export artifact) that blocked `pnpm install`
  entirely; removed. 41 files under `apps/web/src/app/components/ui/` had import
  specifiers with an inline version pin (e.g. `from "sonner@2.0.3"`) that blocked
  `vite build` entirely; stripped mechanically (67 total occurrences across both
  passes). Neither touched any visual or behavioral code — see
  SPRINT_1_REPORT.md Section 8 for the exact mechanism.

## How to run

Not fully verified this sprint (see Known debt above). What is confirmed working:

```
pnpm install                                   # workspace install — verified
cd packages/shared
pnpm exec drizzle-kit generate                 # regenerate migrations — verified
pnpm exec tsx src/openapi/generate.ts          # regenerate openapi.json — verified
pnpm exec tsc --noEmit                         # typecheck — verified, 0 errors
cd ../../apps/web
pnpm exec vite build                           # frontend build — verified
```

Not yet possible: `docker compose up` (no compose file exists — Sprint 2
deliverable), applying migrations to a real database, running the seed script
against one, or running any backend at all (`apps/api` does not exist).
