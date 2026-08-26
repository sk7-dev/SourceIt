import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { publisherVerificationStatusSchema } from "./enums";

export const publisherSchema = z
  .object({
    id: uuidSchema,
    organizationName: z.string(),
    displayName: z.string(),
    website: z.string().url(),
    description: z.string(),
    categories: z.array(z.string()).nullable(),
    verificationStatus: publisherVerificationStatusSchema,
    transparencyLevel: z.number().int().min(1).max(5),
    credibilityScore: z.number().int().min(0).max(100),
    createdAt: isoDatetimeSchema,
  })
  .openapi("Publisher");

// Registration form fields — RegisterForm.tsx:202-262, docs/DOMAIN.md #2.
export const createPublisherRequestSchema = z
  .object({
    organizationName: z.string().min(1),
    website: z.string().url(),
    description: z.string().min(1),
  })
  .openapi("CreatePublisherRequest");

// AnalyticsCards.tsx:4-36 — derived aggregate counts, never stored independently.
export const publisherAnalyticsSchema = z
  .object({
    totalArticlesPublished: z.number().int().min(0),
    verifiedArticleCount: z.number().int().min(0),
    pendingReviewCount: z.number().int().min(0),
    disputedArticleCount: z.number().int().min(0),
  })
  .openapi("PublisherAnalytics");

// CredibilityPanel.tsx:6-25 — the published, auditable breakdown behind
// credibilityScore. Resolves OPEN_QUESTIONS.md #3 (3-factor v1 scope).
export const credibilityBreakdownSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    tier: z.string(),
    trend: z.number().int().nullable(),
    factors: z.object({
      verifiedArticles: z.number().int(),
      disputedClaims: z.number().int(),
      transparentCorrections: z.number().int(),
    }),
  })
  .openapi("CredibilityBreakdown");

export const credibilityHistoryPointSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    recordedAt: isoDatetimeSchema,
  })
  .openapi("CredibilityHistoryPoint");

export const verifyPublisherRequestSchema = z
  .object({
    decision: z.enum(["verified", "rejected"]),
  })
  .openapi("VerifyPublisherRequest");
