import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { errorEnvelopeSchema, paginatedResponseSchema, paginationQuerySchema, uuidSchema } from "../../zod/common";
import {
  articleSchema,
  articleVersionSchema,
  createArticleRequestSchema,
  createArticleResponseSchema,
  createArticleVersionRequestSchema,
} from "../../zod/articles";
import { verificationResultSchema, notFoundVerificationResultSchema } from "../../zod/trust";

const articleIdParam = z.object({ articleId: uuidSchema });
const versionParams = z.object({ articleId: uuidSchema, versionId: uuidSchema });

registry.registerPath({
  method: "post",
  path: "/articles",
  tags: ["Articles"],
  summary: "Create an article and its v1.0 version (PublishArticlePanel.tsx)",
  security: authed,
  request: { body: { content: { "application/json": { schema: createArticleRequestSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: createArticleResponseSchema } } },
    403: { description: "Not a member of the target publisher, or publisher not verified", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/articles/{articleId}",
  tags: ["Articles"],
  summary: "Article + its current version (public, unauthenticated)",
  request: { params: articleIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: articleSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/articles/{articleId}/versions",
  tags: ["Articles"],
  summary:
    "Full version history — public and unauthenticated like verification itself (resolves OPEN_QUESTIONS.md #12)",
  request: { params: articleIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(articleVersionSchema) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/articles/{articleId}/versions/{versionId}",
  tags: ["Articles"],
  summary: "One version's full detail, for diffing against another (ArticleEditHistory.tsx)",
  request: { params: versionParams },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: articleVersionSchema } } },
    404: { description: "Not found, or redacted (see GET /versions/{versionId}/redaction)", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/articles/{articleId}/versions",
  tags: ["Articles"],
  summary: "Submit a correction/update as a new version",
  security: authed,
  request: {
    params: articleIdParam,
    body: { content: { "application/json": { schema: createArticleVersionRequestSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: articleVersionSchema } } },
    403: { description: "Not a member of the owning publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/articles/{articleId}/versions/{versionId}",
  tags: ["Articles"],
  summary:
    "Edit a draft version's content — draft only; append-only once submitted (resolves OPEN_QUESTIONS.md #9)",
  security: authed,
  request: {
    params: versionParams,
    body: { content: { "application/json": { schema: createArticleVersionRequestSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: articleVersionSchema } } },
    409: { description: "Version is no longer a draft", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/articles/{articleId}/versions/{versionId}",
  tags: ["Articles"],
  summary: "Hard-delete a draft version — draft only (resolves OPEN_QUESTIONS.md #9)",
  security: authed,
  request: { params: versionParams },
  responses: {
    204: { description: "Deleted" },
    409: { description: "Version is no longer a draft", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/articles/{articleId}/archive",
  tags: ["Articles"],
  summary: "Archive an article at any lifecycle stage (resolves OPEN_QUESTIONS.md #9)",
  security: authed,
  request: { params: articleIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: articleSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/articles/{articleId}/verification",
  tags: ["Verification"],
  summary:
    "The core verification endpoint — public, unauthenticated, must never be slow or down (build prompt, Scale)",
  request: { params: articleIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: verificationResultSchema } } },
    404: {
      description: "Not registered — trustStatus is always 'notfound' here, never absent",
      content: { "application/json": { schema: notFoundVerificationResultSchema } },
    },
  },
});
