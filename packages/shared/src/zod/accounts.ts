import { z } from "./z";
import { uuidSchema, isoDatetimeSchema } from "./common";
import { accountRoleSchema } from "./enums";

export const accountSchema = z
  .object({
    id: uuidSchema,
    email: z.string().email(),
    fullName: z.string(),
    role: accountRoleSchema,
    createdAt: isoDatetimeSchema,
  })
  .openapi("Account");

// GET /me response — includes the role-specific profile id (publisher
// membership, reviewer profile) the frontend needs to know which dashboard to
// route to, without a second round trip.
export const meResponseSchema = z
  .object({
    account: accountSchema,
    publisherIds: z.array(uuidSchema),
    reviewerId: uuidSchema.nullable(),
  })
  .openapi("MeResponse");
