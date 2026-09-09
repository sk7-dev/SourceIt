# Sprint 7 — Dispute Slice

**Dates:** 2026-09-09 → 2026-09-09  ·  **Status:** Complete with carryover

## 1. Objective

Make disputes real, and make the build prompt's hardest transparency invariant —
"a publisher cannot suppress a dispute against itself" — a property the schema
and the authorization layer enforce rather than a promise. An approved reviewer
with no structural affiliation to a publisher can file a dispute against one of
its published versions; the publisher can only ever *append* a
`publisher_responded` event (free text, a correction version, or both); the
filer alone can withdraw, and the filer or a site admin can mark it resolved;
the publisher can never resolve, withdraw, hide, downrank, or delay it. A
dispute's current status is derived from its latest event (or "open" if it has
none), the whole lifecycle log is append-only, and the reads are public. This is
the third and last input `GET /articles/{id}/verification` needs — after this,
that composed endpoint and the trust-status computation are buildable.

Per the user's confirmation this slice is **backend + tests only**: there is no
dispute UI in the Figma Make export to wire, and disputes will reach the
frontend later through the composed verification endpoint. The user also
confirmed a **terminal** lifecycle: once a dispute is withdrawn or resolved, no
further events can be appended.

The objective was met. Nothing in it was blocked.

## 2. Changes from Previous Sprint

- **`Actor` gained a `role` field.** `requireActor` and `resolveOptionalActor`
  already loaded the full account row; they now put `account.role` on the actor.
  Only `dispute:resolve` reads it (a site admin may close a dispute the filer
  left hanging). No route or repository change followed from this.
- **`can.ts` gained four dispute actions.** `dispute:file` shares the exact gate
  as `review:create` (approved reviewer, not a `publisher_members` row for the
  publisher) — a shared `case` in the switch. `dispute:respond` is publisher
  membership. `dispute:withdraw` is filer-only. `dispute:resolve` is filer or
  `role === "admin"`.
- **The five dispute paths gained error responses** the Sprint 1 contract
  omitted: `404` on the two version-scoped endpoints (unknown or draft version),
  `404` on the dispute-id endpoints, `409` on `/respond` and `/resolve` (dispute
  already closed), and `400` on `/respond` (bad `correctionVersionId`). Additive
  OpenAPI amendment, no body shape changed; `openapi.json` and the client were
  regenerated.
- **No migration.** `disputes`, `dispute_events`, their append-only triggers,
  and `disputes_article_version_id_idx` / `dispute_events_dispute_id_idx` have
  existed since Sprint 1. Third sprint running (Evidence, Review, Dispute) to
  build against a Sprint 1 table with no schema work.
- **Carried over, still carried:** `GET /articles/{id}/verification` unbuilt (now
  unblocked); no real chain `AnchorProvider`; no admin re-queue for
  `anchor_failed`; evidence hashes not anchored; no real `ObjectStore` /
  `SourceArchiver` / evidence-blob-read endpoint; evidence frontend write path
  unwired; `RegisterForm` unwired; no backend search; the pre-existing
  millisecond-truncated cursor in `articles.repository.ts`.
- **Docker still unavailable** (seventh sprint). Verified via a scratch
  `embedded-postgres` instance outside the repo, torn down after.

## 3. Key Enhancements

- An **approved**, non-affiliated reviewer can `POST /versions/{versionId}/disputes`
  with `{ reason }` against a published version. Any other caller is refused:
  a non-reviewer, a pending reviewer, or an affiliated reviewer all get `403`.
- Anyone can `GET /versions/{versionId}/disputes` (cursor paginated) and
  `GET /disputes/{disputeId}` (one dispute with its full event history). Each
  dispute carries the filer's **public** identity only (`displayName`, pseudonym
  when chosen), the `reason`, the derived `status`, and the ordered `events`. A
  draft version's disputes `404` — its existence is not disclosed; there is no
  code path by which a publisher can make a filed dispute stop being served.
- A member of the disputed publisher can `POST /disputes/{disputeId}/respond`
  with a `note`, a `correctionVersionId` (validated to be a *published* version
  of the *disputed article*), or both. It appends a `publisher_responded` event
  and moves the status there. It can be called repeatedly while the dispute is
  open. It cannot resolve, withdraw, or hide anything.
- The filer can `POST /disputes/{disputeId}/resolve` with `eventType: "withdrawn"`;
  the filer or a site admin can resolve with `"resolved_corrected"` or
  `"resolved_addressed_no_verdict"`. The publisher can do neither. Once a
  terminal event is appended, `/respond` and `/resolve` both `409` — the
  history stays permanently visible, it just can't change.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/disputes.route.ts` → `services/disputes.service.ts`
  → `repositories/disputes.repository.ts`, following the Phase 3 template, reusing
  `repositories/reviewers.repository.ts` for the filing gate.
- **`disputes.repository.ts`** builds the wire row from `disputes ⨝ reviewers ⨝
  accounts` and fetches events separately (one query for a single dispute, one
  `IN (…)` query for a whole list page, grouped in the service). `status` and
  the terminal check are derived in the service from the event list — never
  stored. Events are ordered by `(created_at, id)` in SQL, so the "latest event
  = status" rule doesn't depend on any JS-side timestamp precision.
- **Keyset pagination on `disputes.id`** — same cursor hazard the Evidence and
  Review slices avoided.
- **`can.ts` now needs the actor's role**, sourced from the account row the
  auth pre-handlers already fetch. `Actor.role` is typed `string` (not the enum)
  to keep `can.ts` free of a schema-package type dependency.
- **No new dependency**, no new package edge, no new background process, no
  frontend change.

## 5. Database Changes

**None.** `migrations/` is unchanged. The `disputes` table
(`article_version_id` and `filed_by_reviewer_id` FKs, `reason`, `created_at`),
the `dispute_events` table (`dispute_id` FK, `event_type` enum — deliberately
excluding `open`, which is only ever a derived status — `note`,
`correction_version_id` FK, `actor_account_id` FK, `created_at`), the
`disputes_append_only` and `dispute_events_append_only`
`BEFORE UPDATE OR DELETE` triggers, and both indexes were created in Sprint 1
and fit this slice unchanged. All six existing migrations were applied to a real
Postgres by every integration-test run this sprint.

## 6. New Components

**Endpoints** (of the 33 in `openapi.json`, 20 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /versions/{versionId}/disputes | public | Disputes against the version, cursor-paginated, each with derived status + event log. 404 if the version is unknown or a draft. |
| POST | /versions/{versionId}/disputes | Clerk bearer token | File a dispute. 403 unless an approved, non-affiliated reviewer; 404 if the version is unknown or a draft; 400 on a bad body. |
| GET | /disputes/{disputeId} | public | One dispute with its full event history. 404 if unknown. |
| POST | /disputes/{disputeId}/respond | Clerk bearer token | Publisher member appends `publisher_responded` (note and/or correction version). 400 bad correction; 403 non-member; 404 unknown; 409 closed. |
| POST | /disputes/{disputeId}/resolve | Clerk bearer token | Filer withdraws, or filer/admin resolves. 403 otherwise (always for the publisher); 404 unknown; 409 closed. |

Layering: `routes/disputes.route.ts` → `services/disputes.service.ts` →
`repositories/disputes.repository.ts` (+ `repositories/reviewers.repository.ts`,
`auth/can.ts`) → Postgres.

**`apps/api` new modules:** `repositories/disputes.repository.ts`
(`findVersionWithPublisher`, `findVersionInArticle`, `createDispute`,
`findDisputeById`, `findDisputeContext`, `appendEvent`, `listEvents`,
`listEventsForDisputes`, `listDisputes`), `services/disputes.service.ts`
(`listDisputes`, `getDispute`, `fileDispute`, `respondToDispute`,
`resolveDispute`), `routes/disputes.route.ts`.

**Contract (`packages/shared`):** `paths/disputes.ts` gained `400`/`404`/`409`
responses; `openapi.json` and `src/client/schema.d.ts` regenerated. No Zod
schema changed.

**Frontend:** none. Disputes have no UI in the export; they reach the frontend
later via `GET /articles/{id}/verification`.

## 7. Sprint Test Results

**Totals: 127 tests, 127 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 87 — up from 56
by the 31 new dispute tests). No test was weakened to pass; nothing failed
during development that forced a design change.

**`apps/api` — `test/disputes.integration.test.ts`: 31/31** (real Postgres via
`embedded-postgres`, `--no-file-parallelism`):

*GET /versions/:versionId/disputes* — 404 unknown version; 404 draft version;
`{ items: [], nextCursor: null }` for a published version with none; three
disputes filed, `?limit=2` walked across two pages with the union exactly the
three rows, no overlap, every `status` `"open"`.

*POST /versions/:versionId/disputes* — 401 no header; **403** not a reviewer;
**403** pending reviewer; **403** structurally affiliated reviewer (the
conflict-of-interest and authenticated-but-unauthorized test); 404 unknown
version; 404 draft version; 400 missing `reason`; **201** approved
non-affiliated reviewer — `status: "open"`, `events: []`, `filedBy.displayName`
is the pseudonym and `filedBy` has no `fullName`.

*GET /disputes/:disputeId* — 404 unknown; 200 with the full event history after
a response.

*POST /disputes/:disputeId/respond* — 401 no header; **403** the filer tries to
respond (not a member); **403** a plain non-member; 404 unknown dispute; **400**
neither note nor correction (the Zod `.refine`); **400** `correctionVersionId`
is a draft; **400** `correctionVersionId` belongs to a different article; **201**
a member responds with a note → `status: "publisher_responded"`; **201** a
second response carrying a published minor-correction version of the same
article → two events, the last with `correctionVersionId` set; **409** respond
after the dispute is withdrawn.

*POST /disputes/:disputeId/resolve* — 401 no header; **403** a publisher member
tries to `resolve` **and** to `withdraw` (a publisher can never close a
dispute); **403** a non-filer non-admin reviewer tries to resolve; **403**
anyone other than the filer tries to `withdraw`, *including an admin*; **201**
the filer withdraws → `status: "withdrawn"`; **201** the filer resolves
`resolved_addressed_no_verdict`; **201** a site admin resolves `resolved_corrected`
a dispute the filer left hanging; **409** a second resolve of a closed dispute.

*append-only* — a direct `UPDATE` against `disputes` rejects with
`/append-only/`; after an event is appended, a direct `UPDATE` against
`dispute_events` rejects the same way.

**Invariant coverage (build prompt Section 1):**
- *A publisher cannot suppress a dispute against itself — visible from the
  moment filed; publishers may respond; they may not delete, hide, downrank, or
  delay* — `GET` is public with no auth pre-handler and 404s only a
  draft/unknown version, never at a publisher's request; the publisher's only
  write is an appended `publisher_responded` event; the two "publisher tries to
  resolve / withdraw → 403" assertions; the append-only triggers on both tables,
  proven from tests.
- *SourceIt does not adjudicate truth* — resolution events are procedural and
  one is literally named `resolved_addressed_no_verdict`; there is no `isTrue`,
  no verdict field, no status the platform sets to mean "the claim was false".
- *Conflict of interest is structural* — `dispute:file` reuses the reviewer COI
  gate; the affiliated-reviewer `403` test.
- *Reads are public and unauthenticated* — both `GET`s have no `preHandler`; the
  draft/unknown `404` tests prove a non-public version discloses nothing.

**Existing suites, unchanged and still green:** `articles` 18/18, `evidence`
13/13, `reviews` 18/18, `anchor` 4/4, `me` 3/3; `@sourceit/worker` 7/7;
`@sourceit/anchoring` 33/33.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across `apps/api`, `apps/worker`,
`packages/shared`, `packages/anchoring`. No `any`, no `@ts-expect-error`, no
skipped tests. **`apps/web`:** `vite build` succeeds (2204 modules, unchanged)
against the regenerated client.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2 added the
workflow. Docker still unavailable here; `embedded-postgres` remains the
substitute. (Operational note: `embedded-postgres` instances from prior sprints
left an orphaned `postgres.exe` holding the test port after the launcher was
killed; this run used a fresh port and data dir. Not a product issue — an
artifact of the Docker-less test setup on Windows.)

## 8. Outcome

**Done and verified against a real Postgres:** all five dispute endpoints end to
end — the approved-reviewer filing gate with structural COI, public
never-suppressible reads, publisher response limited to an appended event with a
validated correction version, filer-only withdrawal, filer-or-admin resolution,
a terminal lifecycle, derived status, and append-only enforcement proven from
tests to leave the filing and the log immutable. 127/127 tests green.

**Not done, deliberately:**
- **No frontend.** Disputes have no UI in the Figma Make export; a dispute panel
  on `/verification-result` would be net-new component structure with no mock to
  replace. Disputes surface to the frontend through
  `GET /articles/{id}/verification`, which is now buildable.
- **Withdrawal is filer-only, even for an admin.** An admin can *resolve* a
  stuck dispute but not *withdraw* it — "withdrawn" means the filer changed
  their mind, which no one else can do on their behalf. Deliberate; revisit only
  if operations needs an admin escape hatch for abandoned filings.
- **The correction-version check is same-article + published only.** A publisher
  can still reference an unrelated version in the free-text `note`; that is not
  and should not be blocked.

**Known debt incurred:**
- `Actor.role` is typed `string`, not the `account_role` enum, to keep `can.ts`
  from importing a `@sourceit/shared` type. Low risk (the only comparison is
  `=== "admin"`); tighten if `role` grows more uses.
- `dispute:file` and `review:create` share a switch `case` in `can`. Correct and
  documented, but a future divergence in one gate means splitting them.
- Same pre-existing item as Sprints 5–6: `articles.repository.ts` still keys its
  cursors on a millisecond-truncated `created_at` ISO string. Repay when those
  endpoints are next touched.

**Blocked on:** nothing.

**Next sprint should do first:** `GET /articles/{id}/verification` — the composed
read the whole `/verification-result` page was built around. Evidence, Review,
and Dispute all exist now; this sprint assembles them plus the article, its
current version, the publisher, and the derived **TrustStatus** (6 values,
`docs/DOMAIN.md` #12) into one public response, and wires the remaining mock
panels (TrustSummaryCard, PublisherCredibility). It needs the credibility
computation (the 3 frontend-shown factors, per the 2026-08-26 decision) and a
written definition of how each TrustStatus value is derived. Alternatively,
account provisioning so `RegisterForm` works. Either way: push to GitHub and
confirm CI actually goes green — it still never has.
