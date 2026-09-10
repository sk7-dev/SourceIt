import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { errorEnvelopeSchema, paginatedResponseSchema, paginationQuerySchema, uuidSchema } from "../../zod/common";
import { accountSchema } from "../../zod/accounts";
import {
  createPublisherFollowRequestSchema,
  createReaderRequestSchema,
  createSavedArticleRequestSchema,
  publisherFollowSchema,
  savedArticleSchema,
} from "../../zod/reader";

const savedArticleIdParam = z.object({ savedArticleId: uuidSchema });
const followIdParam = z.object({ followId: uuidSchema });
const err = { content: { "application/json": { schema: errorEnvelopeSchema } } };

registry.registerPath({
  method: "post",
  path: "/readers",
  tags: ["Reader"],
  summary:
    "Self-service reader registration — session only, materializes the caller's accounts row (RegisterForm.tsx reader path). Mirrors POST /publishers.",
  security: authed,
  request: { body: { content: { "application/json": { schema: createReaderRequestSchema } } } },
  responses: {
    201: { description: "Created (or already existed)", content: { "application/json": { schema: accountSchema } } },
    401: { description: "No session", ...err },
    409: { description: "That email is already registered to a different account", ...err },
  },
});

registry.registerPath({
  method: "get",
  path: "/saved-articles",
  tags: ["Reader"],
  summary: "The current reader's saved articles (SavedArticles.tsx)",
  security: authed,
  request: { query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(savedArticleSchema) } } },
    401: { description: "No session / no account", ...err },
  },
});

registry.registerPath({
  method: "post",
  path: "/saved-articles",
  tags: ["Reader"],
  summary: "Bookmark an article",
  security: authed,
  request: { body: { content: { "application/json": { schema: createSavedArticleRequestSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: savedArticleSchema } } },
    401: { description: "No session / no account", ...err },
    404: { description: "No such article (unknown or archived)", ...err },
    409: { description: "Already saved", ...err },
  },
});

registry.registerPath({
  method: "delete",
  path: "/saved-articles/{savedArticleId}",
  tags: ["Reader"],
  summary: "Unbookmark — never affects the underlying article",
  security: authed,
  request: { params: savedArticleIdParam },
  responses: {
    204: { description: "Deleted" },
    401: { description: "No session / no account", ...err },
    403: { description: "Not the owning reader", ...err },
    404: { description: "No such saved-article row", ...err },
  },
});

registry.registerPath({
  method: "get",
  path: "/publisher-follows",
  tags: ["Reader"],
  summary: "The current reader's followed publishers (TrustedPublishers.tsx)",
  security: authed,
  request: { query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(publisherFollowSchema) } } },
    401: { description: "No session / no account", ...err },
  },
});

registry.registerPath({
  method: "post",
  path: "/publisher-follows",
  tags: ["Reader"],
  summary: "Follow a publisher",
  security: authed,
  request: { body: { content: { "application/json": { schema: createPublisherFollowRequestSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: publisherFollowSchema } } },
    401: { description: "No session / no account", ...err },
    404: { description: "No such publisher", ...err },
    409: { description: "Already following", ...err },
  },
});

registry.registerPath({
  method: "delete",
  path: "/publisher-follows/{followId}",
  tags: ["Reader"],
  summary: "Unfollow a publisher",
  security: authed,
  request: { params: followIdParam },
  responses: {
    204: { description: "Deleted" },
    401: { description: "No session / no account", ...err },
    403: { description: "Not the owning reader", ...err },
    404: { description: "No such follow row", ...err },
  },
});
