import { computeCredibility } from "./trust";
import type { createPublisherDashboardRepository } from "../repositories/publisherDashboard.repository";
import type { createVerificationRepository } from "../repositories/verification.repository";

type DashboardRepo = ReturnType<typeof createPublisherDashboardRepository>;
type VerificationRepo = ReturnType<typeof createVerificationRepository>;

// The write-side of the publisher dashboard (Sprint 14). The article / review /
// dispute / verification services call this after a successful mutation to
// append an `activity_events` row and — for the events that move the score — a
// `credibility_score_history` point. Credibility itself is still derived at
// read time; this table is a log of what the derivation produced over time
// (the sparkline at CredibilityPanel.tsx). The cached
// `publishers.credibility_score` column is deliberately left unwritten.
export function createPublisherEventRecorder(
  dashboardRepo: DashboardRepo,
  verificationRepo: VerificationRepo,
) {
  return {
    async recordActivity(input: {
      publisherId: string;
      type: string;
      title: string;
      articleId?: string | null;
      articleVersionId?: string | null;
    }) {
      await dashboardRepo.insertActivity(input);
    },

    // Recompute the live score and append a history point — but only when it
    // actually changed from the last recorded point, so the trend line stays
    // meaningful.
    async recordCredibilitySnapshot(publisherId: string) {
      const { credibilityScore } = computeCredibility(await verificationRepo.creditAggregate(publisherId));
      const last = await dashboardRepo.latestCredibilityScore(publisherId);
      if (last === credibilityScore) return;
      await dashboardRepo.insertCredibilityPoint(publisherId, credibilityScore);
    },
  };
}

export type PublisherEventRecorder = ReturnType<typeof createPublisherEventRecorder>;
