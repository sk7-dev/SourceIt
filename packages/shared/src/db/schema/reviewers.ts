import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { reviewerApprovalStatusEnum } from "./enums";

// Reviewer profile — docs/DOMAIN.md #3. `useLegalName`/`pseudonym` resolve
// OPEN_QUESTIONS.md #10: public display can be a pseudonym, but `accounts.fullName`
// (joined via accountId) is always retained for internal accountability.
export const reviewers = pgTable("reviewers", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id),
  affiliation: text("affiliation").notNull(),
  expertise: text("expertise").notNull(),
  applicationReason: text("application_reason").notNull(),
  title: text("title"),
  pseudonym: text("pseudonym"),
  useLegalName: boolean("use_legal_name").notNull().default(true),
  approvalStatus: reviewerApprovalStatusEnum("approval_status")
    .notNull()
    .default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByAccountId: uuid("approved_by_account_id").references(
    () => accounts.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Serves the admin reviewer-approval queue (OPEN_QUESTIONS.md #8 resolution).
  approvalStatusIdx: index("reviewers_approval_status_idx").on(table.approvalStatus),
}));
