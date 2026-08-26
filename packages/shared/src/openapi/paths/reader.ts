import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { errorEnvelopeSchema, paginatedResponseSchema, paginationQuerySchema, uuidSchema } from "../../zod/common";
import {
  createPublisherFollowRequestSchema,
  createSavedArticleRequestSchema,
  publisherFollowSchema,
  savedArticleSchema,
} from "../../zod/reader";

const savedArticleIdParam = z.object({ savedArticleId: uuidSchema });
const followIdParam = z.object({ followId: uuidSchema });

registry.registerPath({
  method: "get",
  path: "/saved-articles",
  tags: ["Reader"],
  summary: "The current reader's saved articles (SavedArticles.tsx)",
  security: authed,
  request: { query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(savedArticleSchema) } } },
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
    403: { description: "Not the owning reader", content: { "application/json": { schema: errorEnvelopeSchema } } },
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
    403: { description: "Not the owning reader", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
