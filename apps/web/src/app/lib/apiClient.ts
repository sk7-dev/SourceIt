import { useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import { createApiClient } from "@sourceit/shared/client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

// Public reads (verification, version history) never need a token — creating
// the client without a `getToken` callback still works fine for those calls,
// it just never attaches an Authorization header. `useApiClient` is for
// anywhere a component might also need an authenticated call.
export function useApiClient() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(API_BASE_URL, () => getToken()), [getToken]);
}

// For public-only call sites (no Clerk context needed) — avoids requiring
// every reader-facing page to sit under a component that calls useAuth().
export const publicApiClient = createApiClient(API_BASE_URL);
