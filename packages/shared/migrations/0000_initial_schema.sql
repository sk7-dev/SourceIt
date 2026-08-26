CREATE TYPE "public"."account_role" AS ENUM('reader', 'publisher', 'reviewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('publish', 'blockchain', 'review', 'update', 'correction', 'dispute_filed', 'redaction');--> statement-breakpoint
CREATE TYPE "public"."anchor_batch_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."anchor_status" AS ENUM('pending', 'anchored', 'anchor_failed');--> statement-breakpoint
CREATE TYPE "public"."article_category" AS ENUM('politics', 'technology', 'health', 'science', 'business');--> statement-breakpoint
CREATE TYPE "public"."change_type" AS ENUM('original_published', 'major_update', 'minor_correction');--> statement-breakpoint
CREATE TYPE "public"."dispute_event_type" AS ENUM('publisher_responded', 'withdrawn', 'resolved_corrected', 'resolved_addressed_no_verdict');--> statement-breakpoint
CREATE TYPE "public"."evidence_file_type" AS ENUM('image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."evidence_tag" AS ENUM('cover_image', 'media', 'evidence', 'source');--> statement-breakpoint
CREATE TYPE "public"."publisher_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."publisher_verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."redaction_category" AS ENUM('court_order', 'defamation_ruling', 'right_to_erasure');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'pending_review', 'verified');--> statement-breakpoint
CREATE TYPE "public"."review_type" AS ENUM('confirmation', 'clarification', 'correction_note');--> statement-breakpoint
CREATE TYPE "public"."reviewer_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "account_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publisher_members" (
	"publisher_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "publisher_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_members_publisher_id_account_id_pk" PRIMARY KEY("publisher_id","account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"organization_name" text NOT NULL,
	"display_name" text NOT NULL,
	"website" text NOT NULL,
	"description" text NOT NULL,
	"categories" text[],
	"verification_status" "publisher_verification_status" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_account_id" uuid,
	"transparency_level" integer DEFAULT 3 NOT NULL,
	"credibility_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publishers_clerk_org_id_unique" UNIQUE("clerk_org_id"),
	CONSTRAINT "transparency_level_range" CHECK ("publishers"."transparency_level" between 1 and 5),
	CONSTRAINT "credibility_score_range" CHECK ("publishers"."credibility_score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credibility_score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credibility_history_score_range" CHECK ("credibility_score_history"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"affiliation" text NOT NULL,
	"expertise" text NOT NULL,
	"application_reason" text NOT NULL,
	"title" text,
	"pseudonym" text,
	"use_legal_name" boolean DEFAULT true NOT NULL,
	"approval_status" "reviewer_approval_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewers_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"category" "article_category" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"version_major" integer NOT NULL,
	"version_minor" integer NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"author_name" text NOT NULL,
	"tags" text[],
	"source_links" text[],
	"change_type" "change_type" NOT NULL,
	"change_summary" text,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"previous_version_id" uuid,
	"content_hash" text,
	"previous_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "article_version_unique" UNIQUE("article_id","version_major","version_minor"),
	CONSTRAINT "version_non_negative" CHECK ("article_versions"."version_major" >= 0 and "article_versions"."version_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_version_id" uuid NOT NULL,
	"file_type" "evidence_file_type" NOT NULL,
	"tag" "evidence_tag" NOT NULL,
	"filename" text NOT NULL,
	"caption" text,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"source_url" text,
	"is_archived_snapshot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_retractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"reason" text,
	"retracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_retractions_review_id_unique" UNIQUE("review_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_version_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"type" "review_type" NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispute_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"event_type" "dispute_event_type" NOT NULL,
	"note" text,
	"correction_version_id" uuid,
	"actor_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_version_id" uuid NOT NULL,
	"filed_by_reviewer_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "anchor_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merkle_root" text,
	"chain_tx_hash" text,
	"status" "anchor_batch_status" DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "anchor_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_version_id" uuid NOT NULL,
	"anchor_batch_id" uuid,
	"status" "anchor_status" DEFAULT 'pending' NOT NULL,
	"leaf_hash" text NOT NULL,
	"merkle_proof" jsonb,
	"block_height" integer,
	"chain_confirmations" integer DEFAULT 0 NOT NULL,
	"anchored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anchor_records_article_version_id_unique" UNIQUE("article_version_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_version_id" uuid NOT NULL,
	"category" "redaction_category" NOT NULL,
	"reason" text NOT NULL,
	"tombstone_hash" text NOT NULL,
	"redacted_by_account_id" uuid NOT NULL,
	"redacted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redactions_article_version_id_unique" UNIQUE("article_version_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publisher_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"publisher_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_follow_per_reader" UNIQUE("account_id","publisher_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_save_per_reader" UNIQUE("account_id","article_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"title" text NOT NULL,
	"article_id" uuid,
	"article_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher_members" ADD CONSTRAINT "publisher_members_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher_members" ADD CONSTRAINT "publisher_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publishers" ADD CONSTRAINT "publishers_verified_by_account_id_accounts_id_fk" FOREIGN KEY ("verified_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credibility_score_history" ADD CONSTRAINT "credibility_score_history_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviewers" ADD CONSTRAINT "reviewers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviewers" ADD CONSTRAINT "reviewers_approved_by_account_id_accounts_id_fk" FOREIGN KEY ("approved_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_previous_version_id_article_versions_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_retractions" ADD CONSTRAINT "review_retractions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_correction_version_id_article_versions_id_fk" FOREIGN KEY ("correction_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_filed_by_reviewer_id_reviewers_id_fk" FOREIGN KEY ("filed_by_reviewer_id") REFERENCES "public"."reviewers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "anchor_records" ADD CONSTRAINT "anchor_records_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "anchor_records" ADD CONSTRAINT "anchor_records_anchor_batch_id_anchor_batches_id_fk" FOREIGN KEY ("anchor_batch_id") REFERENCES "public"."anchor_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redactions" ADD CONSTRAINT "redactions_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redactions" ADD CONSTRAINT "redactions_redacted_by_account_id_accounts_id_fk" FOREIGN KEY ("redacted_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher_follows" ADD CONSTRAINT "publisher_follows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher_follows" ADD CONSTRAINT "publisher_follows_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_members_account_id_idx" ON "publisher_members" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishers_verification_status_idx" ON "publishers" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credibility_history_publisher_id_recorded_at_idx" ON "credibility_score_history" USING btree ("publisher_id","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviewers_approval_status_idx" ON "reviewers" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_publisher_id_idx" ON "articles" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_versions_article_id_idx" ON "article_versions" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_article_version_id_idx" ON "evidence" USING btree ("article_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_article_version_id_idx" ON "reviews" USING btree ("article_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispute_events_dispute_id_idx" ON "dispute_events" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_article_version_id_idx" ON "disputes" USING btree ("article_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_publisher_id_created_at_idx" ON "activity_events" USING btree ("publisher_id","created_at");