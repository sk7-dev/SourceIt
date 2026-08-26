import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";

// RecentActivity.tsx:4-45.
export const activityTypeSchema = z.enum([
  "publish",
  "blockchain",
  "review",
  "update",
  "correction",
  "dispute_filed",
  "redaction",
]);

export const activityEventSchema = z
  .object({
    id: uuidSchema,
    type: activityTypeSchema,
    title: z.string(),
    articleId: uuidSchema.nullable(),
    createdAt: isoDatetimeSchema,
  })
  .openapi("ActivityEvent");
