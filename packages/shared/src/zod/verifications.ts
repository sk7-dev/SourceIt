import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { reviewerPublicSchema } from "./reviewers";

// Sprint 11. The response to POST /versions/{versionId}/verify. There is no
// request body — the act carries no data beyond "this reviewer verified this
// version now". `verifiedBy` uses the same pseudonym-aware public shape as a
// review's `reviewer`; accounts.fullName is never exposed.
export const versionVerificationSchema = z
  .object({
    id: uuidSchema,
    articleVersionId: uuidSchema,
    verifiedBy: reviewerPublicSchema,
    createdAt: isoDatetimeSchema,
  })
  .openapi("VersionVerification");
