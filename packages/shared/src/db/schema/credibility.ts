import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { publishers } from "./publishers";

// Time series backing the 9-point sparkline at CredibilityPanel.tsx:84 —
// docs/DOMAIN.md #2. One row per recompute; recompute trigger (every new version,
// per OPEN_QUESTIONS.md #3) is a Sprint 2+ concern.
export const credibilityScoreHistory = pgTable("credibility_score_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  publisherId: uuid("publisher_id")
    .notNull()
    .references(() => publishers.id),
  score: integer("score").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  scoreRange: check("credibility_history_score_range", sql`${table.score} between 0 and 100`),
  // Serves the 9-point trend sparkline (CredibilityPanel.tsx:84).
  publisherIdRecordedAtIdx: index("credibility_history_publisher_id_recorded_at_idx").on(
    table.publisherId,
    table.recordedAt,
  ),
}));
