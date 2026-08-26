import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { trustStatusSchema } from "./enums";

// SavedArticles.tsx:11-52 — denormalized for the list view so the frontend
// doesn't need a second round trip per row.
export const savedArticleSchema = z
  .object({
    id: uuidSchema,
    articleId: uuidSchema,
    title: z.string(),
    publisherName: z.string(),
    trustStatus: trustStatusSchema,
    savedAt: isoDatetimeSchema,
  })
  .openapi("SavedArticle");

export const createSavedArticleRequestSchema = z
  .object({ articleId: uuidSchema })
  .openapi("CreateSavedArticleRequest");

// TrustedPublishers.tsx:6-43.
export const publisherFollowSchema = z
  .object({
    id: uuidSchema,
    publisherId: uuidSchema,
    publisherName: z.string(),
    verified: z.boolean(),
    credibilityScore: z.number().int().min(0).max(100),
    createdAt: isoDatetimeSchema,
  })
  .openapi("PublisherFollow");

export const createPublisherFollowRequestSchema = z
  .object({ publisherId: uuidSchema })
  .openapi("CreatePublisherFollowRequest");
