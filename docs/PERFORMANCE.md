# Performance — N+1 audit & index verification

Phase 5 (Sprint 15). Every list / composed-read endpoint was reviewed for N+1
query patterns, and its hot queries were run through `EXPLAIN (ANALYZE, BUFFERS)`
against a real PostgreSQL 16 loaded with a synthetic dataset — **2 publishers ×
4 000 articles, 8 000 non-draft versions, ~8 000 reviews, 400 disputes, 3 000
saved-articles for one reader, 8 000 activity events, 2 000 credibility-history
points** — well beyond the seed and past year-one "low hundreds of thousands of
assets" for a single publisher.

## N+1 findings

| Endpoint | Finding | Resolution |
|---|---|---|
| `GET /publisher-follows` | `credibilityScore` was computed with one `creditAggregate` (3 queries) **per followed publisher**. | Added `verificationRepo.creditAggregateForPublishers(ids)` — 3 queries total for the whole page, grouped by publisher id. `reader.service.toApiFollows` now maps over one batched result. |
| `GET /saved-articles` | Already batched (Sprint 13): current versions, open-dispute ids, verified ids, redaction map are each one `IN (...)` query for the page. | No change. |
| `GET /articles/{id}/verification` | The composed read is a fixed `Promise.all` of ~7 queries + `creditAggregate` (3); no per-row work. | No change. |
| `GET /publishers/{id}/analytics` · `/credibility` · `/publishers/{id}` | Each is one `creditAggregate` (3 queries) + a pure reduction. | No change. |
| `GET /publishers/{id}/reviews` | Two bounded queries (reviews + disputes, `LIMIT limit+1` each) + one `eventsForDisputes(ids)`. Merge is in memory. | No change. |
| `GET /publishers/{id}/activity` · `/credibility-history` | One keyset query each. | No change. |
| `GET /publishers/{id}/articles` | `listForPublisher` — one articles query + one batched versions query + one batched anchors query. | No change (its millisecond `created_at` cursor is pre-existing debt, unrelated to N+1). |

## Index verification (`EXPLAIN ANALYZE`)

Queries already served well by an existing index — **no change**:

| Query | Plan |
|---|---|
| published versions of an article (`GET /articles/{id}/versions`) | `Index Scan Backward using article_version_unique` — `Index Cond: (article_id = …)`. 0.01 ms. |
| evidence / reviews / disputes by version, keyset on `id` | `Bitmap Index Scan on *_article_version_id_idx` + trivial sort of the few per-version rows. |
| publishers by status (`GET /publishers/pending-verification`, `/reviewers/pending`) | `Index Scan on publishers_verification_status_idx`. |
| activity feed by publisher, `(created_at, id)` desc | `Index Scan Backward using activity_events_publisher_id_created_at_idx` + Incremental Sort (only re-sorts `id` within same-`created_at` ties — ~20 rows). 0.08 ms. |
| credibility history by publisher, `(recorded_at, id)` desc | `Index Scan Backward using credibility_history_publisher_id_recorded_at_idx` + Incremental Sort. 0.02 ms. |
| open-dispute version ids for a set (`verification.repository`) | Anti-join on `disputes` (`article_version_id = ANY`) — small; `disputes_article_version_id_idx` covers the point lookups. |
| publisher reviews stream (both sides) | With `articles(publisher_id)` (already present) the planner drives `articles → article_versions → reviews/disputes` via indexes; the top-N heapsort is over one publisher's bounded set. 2–7 ms at 4 000 articles / 8 000 reviews. |

Queries that were doing a **primary-key scan with a filter** — fixed by
`migrations/0008_hardening_indexes.sql`:

| Query | Before | After |
|---|---|---|
| `GET /saved-articles` (`WHERE account_id = $1 AND id > $cursor ORDER BY id LIMIT n`) | `Index Scan using saved_articles_pkey` with `Filter: (account_id = …)` — scans the PK forward from the cursor discarding other readers' rows; degrades badly for a reader with few saves among many rows. | `Index Scan using saved_articles_account_id_id_idx` — `Index Cond: (account_id = X AND id > cursor)`, no filter, no sort. |
| `GET /publisher-follows` (same shape on `publisher_follows`) | same PK-scan-with-filter | `Index Scan using publisher_follows_account_id_id_idx`. |

`0008` adds exactly those two composite indexes; both are also declared in
`packages/shared/src/db/schema/reader.ts` so the Drizzle schema and the
migration agree (unlike the Sprint 5 anchoring-index drift).

## Not addressed (acceptable at year-one scale, noted for a later pass)

- The activity / credibility-history feeds keep a one-column Incremental Sort for
  the `id` tiebreak; a `(publisher_id, created_at, id)` covering index would
  remove it but the sort is sub-millisecond over ~20 rows.
- `articles.repository.ts`'s `listPublishedVersions` / `listForPublisher` still
  cursor on a millisecond-truncated `created_at` (pre-existing; the id-keyed
  lists avoid it).
- `GET /publishers/{id}/reviews` re-queries both tables from the cursor's
  timestamp ceiling on every page rather than holding a server-side position.
