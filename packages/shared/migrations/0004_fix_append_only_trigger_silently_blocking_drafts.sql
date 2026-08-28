-- Real bug found during Sprint 3 live verification against a real Postgres:
-- reject_non_draft_update_delete() is a FOR EACH ROW BEFORE trigger. For a
-- BEFORE ROW trigger, returning NULL tells Postgres to *skip the operation for
-- that row* — it is not a generic "no-op, fall through" return. Because the
-- old version of this function fell through to `RETURN NULL` after the IF
-- block regardless of outcome, it silently suppressed UPDATE/DELETE on every
-- row, including drafts, which the invariant explicitly requires to remain
-- freely editable. No exception was raised, so `pnpm exec tsx` smoke tests
-- that only checked "did this throw?" reported success; only checking
-- `rowCount` (0 rows affected) surfaced it. There is no data-loss risk from
-- this bug — it was too strict, not too permissive — but it would have
-- silently broken every draft-editing endpoint.

CREATE OR REPLACE FUNCTION reject_non_draft_update_delete() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.review_status <> 'draft')
     OR (TG_OP = 'UPDATE' AND OLD.review_status <> 'draft') THEN
    RAISE EXCEPTION 'article_versions is append-only once submitted: % is not permitted on a % version',
      TG_OP, OLD.review_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
