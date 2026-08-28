-- Cosmetic fix caught during Sprint 3 live verification against a real
-- Postgres: the trigger function's error message used '%s' (a no-op literal
-- 's' in Postgres's RAISE format, which only recognizes bare '%'), producing
-- "not permitted on a verifieds version" instead of "...a verified version".
-- The blocking behavior itself was always correct — this only fixes the text.

CREATE OR REPLACE FUNCTION reject_non_draft_update_delete() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.review_status <> 'draft')
     OR (TG_OP = 'UPDATE' AND OLD.review_status <> 'draft') THEN
    RAISE EXCEPTION 'article_versions is append-only once submitted: % is not permitted on a % version',
      TG_OP, OLD.review_status;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
