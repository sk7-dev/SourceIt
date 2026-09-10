-- Sprint 12 (Redaction slice). A redaction tombstone is permanent — the build
-- prompt: "a permanent tombstone remains showing that something existed at this
-- position, its hash, its timestamp, and the fact and category of redaction."
-- Sprint 1's 0001 migration set up append-only triggers for the version /
-- evidence / review / dispute families but not `redactions` (the table existed,
-- unused, since 0000). This adds it, reusing the shared reject_update_delete()
-- function from 0001 — the same pattern as version_verifications in 0006.
--
-- Redaction is a read-layer suppression: the article_versions row is never
-- modified. So this trigger protects only the tombstone itself.

CREATE TRIGGER redactions_append_only
  BEFORE UPDATE OR DELETE ON redactions
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();
