import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { evidenceFileTypeSchema, evidenceTagSchema } from "./enums";

export const evidenceSchema = z
  .object({
    id: uuidSchema,
    articleVersionId: uuidSchema,
    fileType: evidenceFileTypeSchema,
    tag: evidenceTagSchema,
    filename: z.string(),
    caption: z.string().nullable(),
    contentHash: z.string(),
    sourceUrl: z.string().url().nullable(),
    isArchivedSnapshot: z.boolean(),
    createdAt: isoDatetimeSchema,
  })
  .openapi("Evidence");

// MediaEvidenceUpload.tsx:11-17. File bytes travel out-of-band (multipart) —
// this is the metadata half of the request.
export const uploadEvidenceRequestSchema = z
  .object({
    fileType: evidenceFileTypeSchema,
    tag: evidenceTagSchema,
    filename: z.string().min(1),
    caption: z.string().optional(),
    // Present only when tag = 'source': the external URL to fetch, hash, and
    // archive at submission time (resolves OPEN_QUESTIONS.md #7).
    sourceUrl: z.string().url().optional(),
  })
  .openapi("UploadEvidenceRequest");
