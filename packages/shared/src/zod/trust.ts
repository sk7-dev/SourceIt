import { z } from "./z";
import { uuidSchema } from "./common";
import { trustStatusSchema } from "./enums";
import { articleSchema, articleVersionSchema } from "./articles";
import { anchorRecordSchema } from "./anchoring";
import { evidenceSchema } from "./evidence";
import { reviewSchema } from "./reviews";
import { publisherSchema } from "./publishers";
import { redactionSchema } from "./redactions";

// TrustSummaryCard.tsx:4-45 — the "Why this result?" facts list. trustStatus is
// a computed projection over registry membership, version match, publisher
// verification, evidence count, and dispute state; it is never a stored column
// (docs/DOMAIN.md #12).
export const trustSummaryFactsSchema = z
  .object({
    registryMember: z.boolean(),
    versionMatch: z.boolean(),
    publisherVerified: z.boolean(),
    evidenceCount: z.number().int().min(0),
    openDisputeCount: z.number().int().min(0),
  })
  .openapi("TrustSummaryFacts");

// GET /articles/{id}/verification — public, unauthenticated, the one endpoint
// that must never be slow and never be down (build prompt Section "Scale").
export const verificationResultSchema = z
  .object({
    article: articleSchema,
    currentVersion: articleVersionSchema,
    versionHistory: z.array(articleVersionSchema),
    evidence: z.array(evidenceSchema),
    reviews: z.array(reviewSchema),
    publisher: publisherSchema,
    anchorRecord: anchorRecordSchema,
    redaction: redactionSchema.nullable(),
    trustStatus: trustStatusSchema,
    trustSummary: trustSummaryFactsSchema,
  })
  .openapi("VerificationResult");

export const notFoundVerificationResultSchema = z
  .object({
    trustStatus: z.literal("notfound"),
    queriedId: uuidSchema.optional(),
  })
  .openapi("NotFoundVerificationResult");
