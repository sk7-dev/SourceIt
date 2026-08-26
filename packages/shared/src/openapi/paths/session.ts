import { registry, authed } from "../registry";
import { errorEnvelopeSchema } from "../../zod/common";
import { meResponseSchema } from "../../zod/accounts";

registry.registerPath({
  method: "get",
  path: "/me",
  tags: ["Session"],
  summary: "The current authenticated account and its role-specific profile ids",
  security: authed,
  responses: {
    200: { description: "OK", content: { "application/json": { schema: meResponseSchema } } },
    401: { description: "Unauthenticated", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
