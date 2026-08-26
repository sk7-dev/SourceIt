import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

// Clerk-issued session JWT, passed as a bearer token — see
// docs/STACK_PROPOSAL.md (auth: Clerk, confirmed 2026-08-26).
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
});

export const authed = [{ bearerAuth: [] }];
