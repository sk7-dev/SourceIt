-- Sprint 11 (Version-verification slice). A reviewer's verification of a
-- published version is recorded as an append-only child row, never as an UPDATE
-- of article_versions.review_status — the article_versions_append_only trigger
-- forbids UPDATE on a non-draft row, and the build prompt forbids UPDATE on
-- these entities in general. Presence of a row = the version is "verified"; the
-- composed GET /articles/{id}/verification LEFT JOINs it. The article_version_id
-- UNIQUE constraint makes a second verification a 409.
--
-- The two DROP INDEX lines drizzle-kit emitted here (for the anchor_records /
-- anchor_batches status indexes added by the hand-written 0005) were removed:
-- those indexes exist in the database and serve the anchoring worker's sweep;
-- they are unrelated to this slice. The generated 0006 snapshot no longer
-- carries them, so the spurious diff does not recur.

CREATE TABLE IF NOT EXISTS "version_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_version_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_verifications_article_version_id_unique" UNIQUE("article_version_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "version_verifications" ADD CONSTRAINT "version_verifications_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "version_verifications" ADD CONSTRAINT "version_verifications_reviewer_id_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Append-only, like reviews / review_retractions / dispute_events. Reuses the
-- shared reject_update_delete() from 0001.
CREATE TRIGGER version_verifications_append_only
  BEFORE UPDATE OR DELETE ON version_verifications
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();
