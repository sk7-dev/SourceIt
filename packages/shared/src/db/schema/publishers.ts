import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { publisherMemberRoleEnum, publisherVerificationStatusEnum } from "./enums";

// Publisher organization — docs/DOMAIN.md #2. Mirrors a Clerk Organization
// (PROJECT_STATE.md decision, 2026-08-26); `publisherMembers` mirrors org
// membership so reviewer conflict-of-interest checks (OPEN_QUESTIONS.md #4) can be
// a plain join instead of a call out to Clerk on every request.
export const publishers = pgTable("publishers", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  organizationName: text("organization_name").notNull(),
  displayName: text("display_name").notNull(),
  website: text("website").notNull(),
  description: text("description").notNull(),
  categories: text("categories").array(),
  verificationStatus: publisherVerificationStatusEnum("verification_status")
    .notNull()
    .default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByAccountId: uuid("verified_by_account_id").references(
    () => accounts.id,
  ),
  // 1-5 meter shown at PublisherProfileCard.tsx:47-61. Stored as an integer bound
  // by a check constraint rather than an enum, since the frontend renders it as a
  // meter, not a fixed label set.
  transparencyLevel: integer("transparency_level").notNull().default(3),
  // Derived, never written directly (build prompt invariant, "Credibility is
  // derived, never written") — cached here and recomputed by a Sprint 2+ job; no
  // endpoint may set it. History lives in credibilityScoreHistory.
  credibilityScore: integer("credibility_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  transparencyLevelRange: check(
    "transparency_level_range",
    sql`${table.transparencyLevel} between 1 and 5`,
  ),
  credibilityScoreRange: check(
    "credibility_score_range",
    sql`${table.credibilityScore} between 0 and 100`,
  ),
  // Serves the admin verification queue (OPEN_QUESTIONS.md #8 resolution).
  verificationStatusIdx: index("publishers_verification_status_idx").on(
    table.verificationStatus,
  ),
}));

// Mirrors Clerk org membership. Resolves OPEN_QUESTIONS.md #4: a reviewer is
// "affiliated with a publisher" iff a row exists here for that (account, publisher)
// pair — enforced structurally in the reviewer-review authorization check, not
// merely disclosed.
export const publisherMembers = pgTable("publisher_members", {
  publisherId: uuid("publisher_id")
    .notNull()
    .references(() => publishers.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  role: publisherMemberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.publisherId, table.accountId] }),
  // Reverse lookup for the reviewer conflict-of-interest check: "which
  // publishers is this account a member of?"
  accountIdIdx: index("publisher_members_account_id_idx").on(table.accountId),
}));
