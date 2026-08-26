import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountRoleEnum } from "./enums";

// Base identity for every user, regardless of role — docs/DOMAIN.md #1.
// Credentials/session are owned by Clerk (PROJECT_STATE.md decision, 2026-08-26);
// this table mirrors the subset of Clerk's user record SourceIt needs to join
// against, keyed by clerkUserId.
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: accountRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
