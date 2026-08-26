-- Enforces the build prompt's append-only invariant at the database level
-- ("There are no UPDATE statements against these tables — enforce it at the
-- database level") for the tables the build prompt names explicitly: version,
-- evidence, review, dispute — plus their append-only lifecycle-event children
-- (review_retractions, dispute_events).
--
-- article_versions is the one exception: a row may still be freely UPDATEd or
-- DELETEd while review_status = 'draft', since nobody has seen it yet
-- (resolves OPEN_QUESTIONS.md #9). Once a version leaves 'draft'
-- (pending_review or verified), it is permanently frozen.

CREATE OR REPLACE FUNCTION reject_update_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted on table %',
    TG_TABLE_NAME, TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_non_draft_update_delete() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.review_status <> 'draft')
     OR (TG_OP = 'UPDATE' AND OLD.review_status <> 'draft') THEN
    RAISE EXCEPTION 'article_versions is append-only once submitted: % is not permitted on a %s version',
      TG_OP, OLD.review_status;
  END IF;
  RETURN NULL; -- statement-level BEFORE trigger; row unchanged, no-op otherwise
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_versions_append_only
  BEFORE UPDATE OR DELETE ON article_versions
  FOR EACH ROW EXECUTE FUNCTION reject_non_draft_update_delete();

CREATE TRIGGER evidence_append_only
  BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

CREATE TRIGGER reviews_append_only
  BEFORE UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

CREATE TRIGGER review_retractions_append_only
  BEFORE UPDATE OR DELETE ON review_retractions
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

CREATE TRIGGER disputes_append_only
  BEFORE UPDATE OR DELETE ON disputes
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

CREATE TRIGGER dispute_events_append_only
  BEFORE UPDATE OR DELETE ON dispute_events
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();
