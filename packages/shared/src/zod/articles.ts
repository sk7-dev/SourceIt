import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { articleCategorySchema, changeTypeSchema, reviewStatusSchema } from "./enums";
import { anchorRecordSchema } from "./anchoring";

export const articleSchema = z
  .object({
    id: uuidSchema,
    publisherId: uuidSchema,
    category: articleCategorySchema,
    createdAt: isoDatetimeSchema,
  })
  .openapi("Article");

export const articleVersionSchema = z
  .object({
    id: uuidSchema,
    articleId: uuidSchema,
    versionMajor: z.number().int().min(0),
    versionMinor: z.number().int().min(0),
    versionLabel: z.string().openapi({ example: "v1.0" }),
    headline: z.string(),
    summary: z.string(),
    content: z.string(),
    authorName: z.string(),
    tags: z.array(z.string()).nullable(),
    sourceLinks: z.array(z.string().url()).nullable(),
    changeType: changeTypeSchema,
    changeSummary: z.string().nullable(),
    reviewStatus: reviewStatusSchema,
    previousVersionId: uuidSchema.nullable(),
    contentHash: z.string().nullable(),
    previousHash: z.string().nullable(),
    createdAt: isoDatetimeSchema,
    publishedAt: isoDatetimeSchema.nullable(),
  })
  .openapi("ArticleVersion");

// A lighter row shape for list views (MyArticlesTable.tsx:25-71) — avoids
// shipping full body content in a list response.
export const articleVersionSummarySchema = z
  .object({
    id: uuidSchema,
    versionLabel: z.string(),
    headline: z.string(),
    reviewStatus: reviewStatusSchema,
    anchorStatus: anchorRecordSchema.shape.status,
    publishedAt: isoDatetimeSchema.nullable(),
  })
  .openapi("ArticleVersionSummary");

// PublishArticlePanel.tsx:63-137. Creates an Article + its v1.0 ArticleVersion in
// one call; `submit: false` leaves it as a draft.
export const createArticleRequestSchema = z
  .object({
    category: articleCategorySchema,
    headline: z.string().min(1),
    summary: z.string().min(1),
    content: z.string().min(1),
    authorName: z.string().min(1),
    tags: z.array(z.string()).optional(),
    sourceLinks: z.array(z.string().url()).optional(),
    submit: z.boolean().default(false),
  })
  .openapi("CreateArticleRequest");

// A new version — either a correction to a published article, or an edit to an
// existing draft's content (PATCH uses the same body).
export const createArticleVersionRequestSchema = z
  .object({
    headline: z.string().min(1),
    summary: z.string().min(1),
    content: z.string().min(1),
    authorName: z.string().min(1),
    tags: z.array(z.string()).optional(),
    sourceLinks: z.array(z.string().url()).optional(),
    changeType: changeTypeSchema,
    changeSummary: z.string().min(1).optional(),
    submit: z.boolean().default(false),
  })
  .openapi("CreateArticleVersionRequest");
