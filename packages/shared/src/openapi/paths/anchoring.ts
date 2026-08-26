import { z } from "../../zod/z";
import { registry } from "../registry";
import { errorEnvelopeSchema, uuidSchema } from "../../zod/common";
import { anchorRecordSchema } from "../../zod/anchoring";

const versionIdParam = z.object({ versionId: uuidSchema });

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/anchor",
  tags: ["Verification"],
  summary:
    "The anchor state for this version — always present, always one of pending/anchored/anchor_failed (resolves OPEN_QUESTIONS.md #1)",
  request: { params: versionIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: anchorRecordSchema } } },
    404: { description: "Version does not exist or is still a draft (no anchor record yet)", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
