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

// MediaEvidenceUpload.tsx:11-17. `POST /versions/{versionId}/evidence` is
// `multipart/form-data` (amended from the Sprint 1 `application/json` shape on
// implementation in Sprint 5 — a real file upload can't ride in a JSON body;
// documented in docs/sprints/SPRINT_5_REPORT.md). This schema is the set of
// non-file form fields; the bytes ride alongside in a part named `file`. For
// `tag = 'source'` there is no `file` part — `sourceUrl` is fetched, hashed,
// and archived server-side at attach time instead (resolves OPEN_QUESTIONS.md
// #7). Every other tag requires a `file` part.
export const uploadEvidenceRequestSchema = z
  .object({
    fileType: evidenceFileTypeSchema,
    tag: evidenceTagSchema,
    filename: z.string().min(1),
    caption: z.string().optional(),
    sourceUrl: z.string().url().optional(),
  })
  .openapi("UploadEvidenceRequest");
