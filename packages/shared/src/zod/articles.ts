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
// shipping full body content in a list response. Sprint 3 addition to the two
// fields (articleId, category) this row shape was missing to actually back
// MyArticlesTable's columns — caught during implementation, not part of the
// Sprint 1 stop-point confirmation.
export const articleVersionSummarySchema = z
  .object({
    articleId: uuidSchema,
    id: uuidSchema,
    category: articleCategorySchema,
    versionLabel: z.string(),
    headline: z.string(),
    reviewStatus: reviewStatusSchema,
    anchorStatus: anchorRecordSchema.shape.status.nullable(),
    publishedAt: isoDatetimeSchema.nullable(),
  })
  .openapi("ArticleVersionSummary");

// PublishArticlePanel.tsx:63-137. Creates an Article + its v1.0 ArticleVersion in
// one call; `submit: false` leaves it as a draft. `publisherId` was missing
// from the Sprint 1 draft of this schema — an account can belong to more than
// one publisher (multiple org memberships), so the target has to be explicit
// rather than inferred. Caught during Sprint 3 implementation.
export const createArticleRequestSchema = z
  .object({
    publisherId: uuidSchema,
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

// Sprint 3 addition: returns the created v1.0 version alongside the article,
// so the caller doesn't need a second round trip to learn its id.
export const createArticleResponseSchema = z
  .object({
    article: articleSchema,
    version: articleVersionSchema,
  })
  .openapi("CreateArticleResponse");

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
