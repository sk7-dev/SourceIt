import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

export type { paths, components } from "./schema";

// Build prompt Section 3: "Frontend client: generated from the OpenAPI
// document, checked into the repo." schema.d.ts is generated
// (`pnpm run client:generate`, from openapi.json — never hand-edited); this
// file is the thin, hand-written wrapper around it.
//
// `getToken` is a callback rather than a fixed string because the caller's
// session token can rotate — the frontend passes Clerk's `getToken()` here,
// and tests can pass a fixed fake one.
export function createApiClient(baseUrl: string, getToken?: () => Promise<string | null>) {
  const client = createClient<paths>({ baseUrl });

  if (getToken) {
    const authMiddleware: Middleware = {
      async onRequest({ request }) {
        const token = await getToken();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
    };
    client.use(authMiddleware);
  }

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
