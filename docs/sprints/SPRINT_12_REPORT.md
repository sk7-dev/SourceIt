# Sprint 12 — Redaction

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

Build the legal-takedown slice the build prompt calls a Phase 1 invariant:
"the content becomes unservable, and a permanent tombstone remains showing that
something existed at this position, its hash, its timestamp, and the fact and
category of redaction." Since Sprint 8 the composed verification response has
carried a wired-but-always-`null` `redaction` field, and `openapi.json` has
declared `GET` / `POST /versions/{id}/redaction` as unimplemented; this sprint
implements both and threads content suppression through every public read that
serialises a version. Backend + tests only — there is no redaction UI in the
frontend and none was added.

Four points were confirmed with the user before implementation: (a) a redacted
version's **position stays** in version history — the content fields are nulled
and a `redaction` tombstone is attached; (b) suppression is **read-layer only** —
the `article_versions` row is never modified, so the append-only trigger is
untouched and the original bytes remain for anyone verifying against the chain;
(c) `tombstoneHash` is the version's **existing anchored `contentHash`**, so
"a document with this fingerprint was anchored at this time" stays checkable;
(d) redaction suppresses **only the version's own text** — its evidence,
reviews, anchor record and dispute list all stay fully public. All four were
built as confirmed.

## 2. Changes from Previous Sprint

- **`articleVersionSchema` loosened.** `headline` / `summary` / `content` /
  `authorName` became `.nullable()` (they are `null` on a redacted version;
  `tags` / `sourceLinks` were already nullable), and a new
  `redaction: redactionSchema.nullable()` field was added. This is a real
  contract change that every consumer of `ArticleVersion` inherits — the
  generated client now types those four fields as `string | null`. Non-redacted
  versions still always populate them, so existing frontend code is unaffected
  at runtime; the type now honestly expresses "content can be unservable."
- **`toApiVersion(version, redaction?)` gained a second parameter.** When a
  redaction tombstone is passed, the mapper nulls the six content fields and
  emits the `redaction` object; otherwise it emits `redaction: null`. Every
  public read path (`GET /articles/{id}/versions`,
  `GET /articles/{id}/versions/{versionId}`, and both the `currentVersion` and
  each `versionHistory` entry of `GET /articles/{id}/verification`) now passes
  the version's redaction, so no single payload can show a redacted version's
  content anywhere.
- **`createArticlesService` signature changed** — it now takes a
  `redactionsRepo` between `repo` and `authz`. Both call sites
  (`articles.route.ts`, `publisherArticles.route.ts`) were updated.
- **`verification.repository.ts`'s `findRedactionForVersion` was replaced by
  `findRedactionsForVersions(ids)`** (batch, returns a `Map`). The composed read
  overlays it onto every version and derives its top-level `redaction` from the
  current version's entry — one query instead of one-per-current-version.
- **Migration `0007_redactions_append_only.sql`** adds the append-only trigger
  the Sprint 1 `0001` migration never put on `redactions` (the table has existed
  unused since `0000`). Trigger-only, no schema change; `0007_snapshot.json` is
  a copy of `0006`'s, the same convention `0003` / `0004` used.
- **Carried over, still carried:** reader account provisioning; no real Clerk
  Organization; no real chain `AnchorProvider`; no admin re-queue for
  `anchor_failed`; evidence hashes not anchored; no real `ObjectStore` /
  `SourceArchiver` / evidence-blob-read endpoint; no backend search;
  `articles.repository.ts`'s millisecond-truncated `created_at` cursor; the
  Drizzle snapshot drift for the anchoring status indexes (noted in Sprint 11,
  not repaid here).
- **Docker still unavailable** (twelfth sprint). Verified against a real
  PostgreSQL 16 driven directly from `initdb` / `pg_ctl` on a non-temp path —
  see §7 and Sprint 11's report for why the `embedded-postgres` temp-dir path
  fails on this host.

## 3. Key Enhancements

- `POST /versions/{versionId}/redaction` (admin only) — body
  `{ category, reason }` where `category` is one of `court_order` /
  `defamation_ruling` / `right_to_erasure` and `reason` is the legal detail
  (docket, ruling date, request id). Creates the permanent tombstone; the
  `reason` is stored but **never** returned by any endpoint. `tombstoneHash`
  is copied from the version's `contentHash`. `401` no session, `403` not an
  admin, `404` unknown or draft version (existence not leaked), `409` already
  redacted, `400` bad body.
- `GET /versions/{versionId}/redaction` (public) — the tombstone
  (`{ articleVersionId, category, tombstoneHash, redactedAt }`) or `404` "not
  redacted". No `reason`.
- **Content suppression on every public version read.** A redacted version still
  appears in version history and the composed verification response with its
  `versionLabel`, `versionMajor/Minor`, `changeType`, `changeSummary`,
  `reviewStatus`, `previousVersionId`, `contentHash`, `previousHash`,
  `createdAt`, `publishedAt` intact, but `headline` / `summary` / `content` /
  `authorName` / `tags` / `sourceLinks` are `null` and `redaction` carries the
  tombstone. A redacted **past** version in `versionHistory` is blanked the same
  way while the current version is served normally.
- **The record still verifies.** Redaction does not change `trustStatus` or the
  credibility computation — a redacted version keeps its `contentHash`, review
  status, dispute count and anchor record, so `GET /articles/{id}/verification`
  still resolves (never `notfound` solely because of a redaction) and the anchor
  proof is unaffected.
- **Nothing else is suppressed.** `GET /versions/{id}/reviews`, `.../anchor`,
  `.../disputes`, and the `reviews` array of the composed response all keep
  serving after a redaction.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/redactions.route.ts` →
  `services/redactions.service.ts` → `repositories/redactions.repository.ts` →
  Postgres. One new repository (`findByVersionId`, `findForVersions`, `create`),
  one new service (`getRedaction`, `redactVersion`, `toApiRedaction`).
- **No new authorization primitive.** `redactVersion` reuses the existing
  `{ type: "admin" }` action (decision 2026-08-26 — one `admin` role, and the
  `openapi` summary already said "admin only").
- **`articles.service.ts` gained a `redactionsRepo` dependency** for the two
  public single/list version reads. The write paths (`POST /articles`,
  `POST` / `PATCH /versions`) do not consult it — a freshly written version is
  non-draft-at-most and never already redacted, so they emit `redaction: null`.
- **No new dependency, no background process, no schema change.** The one
  migration adds a trigger, nothing else.

## 5. Database Changes

**`migrations/0007_redactions_append_only.sql`** — one trigger, no table or
column change.

- **Trigger `redactions_append_only`** — `BEFORE UPDATE OR DELETE ON redactions
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete()` (the shared function
  from `0001`). Enforces "the tombstone is permanent." Verified in a live
  database: `UPDATE` and `DELETE` against `redactions` both raise
  `redactions is append-only: … is not permitted`.
- The `redactions` table itself, its `article_version_id` UNIQUE constraint
  (which makes a second redaction a `409`), its two FKs (`article_versions`,
  `accounts`) and every column have existed since `0000_initial_schema.sql` —
  Sprint 1 designed this table and left it unused, exactly as the build prompt's
  "Design this in Phase 1" instruction required.
- No destructive or irreversible change. Rolling back `0007` drops only the
  trigger.

## 6. New Components

**Endpoints** (of the 34 in `openapi.json`, 30 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /versions/{versionId}/redaction | public | The version's tombstone (category, hash, timestamp) or 404. No legal reason. |
| POST | /versions/{versionId}/redaction | admin (Clerk bearer token) | Redact a version under legal takedown. 400 bad body, 401 no session, 403 not admin, 404 unknown/draft version, 409 already redacted. |

Layering: `routes/redactions.route.ts` → `services/redactions.service.ts` →
`repositories/redactions.repository.ts` → Postgres.

**`apps/api` new modules:** `repositories/redactions.repository.ts`,
`services/redactions.service.ts`, `routes/redactions.route.ts`.
**`apps/api` changed:** `services/articles.service.ts` (`toApiVersion` 2nd param
+ blanking + `redaction` field; `createArticlesService` takes `redactionsRepo`;
`listPublishedVersions` + `getVersion` consult it); `routes/articles.route.ts` +
`routes/publisherArticles.route.ts` (pass the repo);
`repositories/verification.repository.ts` (`findRedactionForVersion` →
`findRedactionsForVersions`); `services/verification.service.ts` (batch redaction
overlay on `currentVersion` + `versionHistory`, top-level `redaction` derived
from it); `app.ts` (route registration).

**Contract (`packages/shared`):** `articleVersionSchema` — four content fields
nullable + new `redaction` field; `openapi/paths/redactions.ts` — `401` / `404` /
`409` added to the POST; `migrations/0007_redactions_append_only.sql` (+ journal
entry + snapshot copy); `openapi.json` + `src/client/schema.d.ts` regenerated,
not hand-edited. `redactionSchema` / `createRedactionRequestSchema` already
existed (Sprint 1) and were not changed.

**Seed:** a second Daily Planet article — a single published, anchored v1.0
("Report on Sealed Investigation") redacted under a `court_order`. On every
public read its content is now blanked and its tombstone shown.

## 7. Sprint Test Results

**Totals: 200 tests, 200 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 160 — up from
145 by the 15 new redaction tests). No test was weakened, skipped, or deleted.
`pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings across all four
packages. No `any`, no `@ts-expect-error`. `apps/web`: `vite build` succeeds
(2204 modules, unchanged).

**`apps/api` — `test/redactions.integration.test.ts`: 15/15** (real Postgres,
`--no-file-parallelism`):

*`POST /versions/:versionId/redaction`* — `401` no token; `403` a publisher
owner (non-admin); `404` unknown version; `404` draft version (not leaked);
`400` missing `reason`; **`201`** — response is the tombstone only
(`{ articleVersionId, category, tombstoneHash, redactedAt }`), `tombstoneHash`
equals the version's `contentHash`, no `reason` key, and the stored row has the
legal `reason` and `redactedByAccountId` set; **`409`** on a second redaction.

*`GET /versions/:versionId/redaction`* — `404` when not redacted; `200`
tombstone (no `reason`) once redacted.

*content suppression* — `GET /articles/:id/versions/:vId` blanks the six content
fields and attaches `redaction`, keeping `versionLabel` / `reviewStatus` /
`contentHash` / `previousHash` / `changeType`; `GET /articles/:id/versions`
blanks only the redacted entry, a non-redacted sibling is untouched;
`GET /articles/:id/verification` blanks `currentVersion`, sets the top-level
`redaction`, blanks the matching `versionHistory` entry, and still returns a
non-`notfound` `trustStatus`; a redacted **past** version is blanked in
`versionHistory` while the current version is served and the top-level
`redaction` is `null`.

*non-suppression* — after redaction, `GET /versions/:id/reviews` still lists the
review, `.../anchor` still `200`s, `.../disputes` still `200`s, and the composed
response's `reviews` array is intact.

*append-only* — direct `UPDATE` and `DELETE` against `redactions` each reject
with `/append-only/`.

**Invariant / standard coverage (build prompt Section 1):**
- *Legal takedown without history destruction* — the version keeps its position,
  hashes and timestamps; the tombstone is permanent (DB trigger proven); the
  `article_versions` row is never written, so the anchored bytes and the Merkle
  proof are untouched.
- *Reads are public* — `GET /versions/{id}/redaction` needs no auth; the
  suppression applies equally to every reader.
- *Authorization via `can`* — `POST` goes through `{ type: "admin" }`; `401` /
  `403` / `404` / `409` / `201` all covered.
- *Append-only* — `redactions` now has the trigger the other permanent entities
  got in `0001`.

**Existing suites, unchanged and still green:** `articles` 18, `evidence` 13,
`reviews` 18, `disputes` 31, `verification` 11 (the `articleVersionSchema`
loosening and the service-signature change broke nothing), `versionVerification`
13, `trust` 12, `admin` 12, `anchor` 4, `me` 3, `registration` 10;
`@sourceit/worker` 7; `@sourceit/anchoring` 33.

**Verification environment.** Docker unavailable (twelfth sprint); the
`embedded-postgres` binaries are execution-blocked from `%LOCALAPPDATA%\Temp`
on this host (see Sprint 11 §7). All results above are against a real
**PostgreSQL 16.14** initialised with `initdb` and started with `pg_ctl` from a
non-temp path, `TEST_DATABASE_URL` pointed at it,
`vitest run --no-file-parallelism`. All 8 migrations (0000–0007) apply cleanly
to a fresh database; the seed (incl. the redacted article) runs; the
`redactions_append_only` trigger and the `tombstone_hash = content_hash`
binding were inspected directly in the live catalog. Instance stopped and data
directory removed afterward.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2 added the
workflow. Sprint 12 is awaiting commit.

## 8. Outcome

**Done and verified against a real Postgres:** both redaction endpoints end to
end — the admin gate, the permanent tombstone, the `contentHash` copy, the
`409` on repeat, the `404` on draft/unknown, the legal `reason` never leaving
the database — plus content suppression on all three confirmed public read
paths (list versions, get version, composed verification) for both a current
and a past redacted version, and proof that reviews / anchor / disputes are not
suppressed. The record still verifies (`trustStatus` unaffected, anchor proof
intact). 200/200 tests green; migration + seed + trigger + hash binding
confirmed in a live database.

**Not done, deliberately or blocked:**
- **`GET /publishers/{id}/articles` is not suppressed.** The authenticated
  owner-only dashboard list (`MyArticlesTable`) still shows a redacted
  article's `headline`. This was scoped out: the confirmed decision covered the
  public reads (version history, get version, composed verification), and this
  view carries only the headline, not the body. A strict `right_to_erasure`
  reading would extend suppression here — `articleVersionSummarySchema.headline`
  would go nullable. Revisit if asked.
- **`changeSummary` is not blanked.** The six fields in the confirmed spec
  (`headline` / `summary` / `content` / `authorName` / `tags` / `sourceLinks`)
  are nulled; `changeSummary` ("what changed in this correction") is kept. It
  can carry content-derived phrasing; blank it too if a takedown ever needs it.
- **No redaction UI.** There is no admin redaction screen in the frontend and
  none was built — like Sprints 6, 7, 9, 11 this is backend + tests only. An
  admin redacts via the raw endpoint.
- **Redaction is irreversible.** `article_version_id` is UNIQUE and the
  tombstone is append-only — there is no un-redact endpoint. If a takedown is
  later lifted, a new mechanism is needed (the build prompt does not ask for
  one).
- **`reason` has no structure.** It is free text; there is no link to a stored
  court document or a case-management id. Fine for year one.

**Known debt incurred:**
- **`articleVersionSchema` content fields are now `string | null` for every
  consumer**, not just redacted reads. The generated frontend client types
  change accordingly. No frontend code was updated (no redaction UI), and
  non-redacted data never returns `null`, so nothing breaks at runtime — but a
  future frontend touch should handle the null case on version content.
- **`redactions.repository.create` does a second `SELECT` after `INSERT`** to
  return the tombstone shape — the same pattern as
  `reviews.repository.createReview` and
  `versionVerifications.repository.create`. Acceptable.
- Carried, unchanged: the Drizzle anchoring-index snapshot drift (Sprint 11);
  `articles.repository.ts`'s millisecond-truncated `created_at` cursor.

**Blocked on:** nothing.

**Next sprint should do first:** one of the two remaining Phase 4 slices —
**reader features** (saved-articles + publisher-follows, needs reader account
provisioning: extend Sprint 10's lazy-materialization pattern) or the
**publisher-dashboard reads** (`GET /publishers/{id}`, `/analytics`,
`/activity`, `/credibility`, `/credibility-history`, `/reviews`; may finally
write the cached `credibility_score` column / history). After those, Phase 4 is
done and Phase 5 (hardening) begins. Independently, and increasingly overdue:
**push to GitHub and confirm CI actually goes green — it still never has.**
