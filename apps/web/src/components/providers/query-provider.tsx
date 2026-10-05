"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-error";

/**
 * Dev-only, and split into its own chunk that production never fetches: a plain top-level
 * `import { ReactQueryDevtools } from "@tanstack/react-query-devtools"` here would ship the
 * whole devtools bundle to every real user on every page, since this provider sits in the root
 * layout. `process.env.NODE_ENV === "production"` is inlined by Next's build, so the `import()`
 * branch below is dead code in prod builds and never ends up in the client bundle.
 */
const ReactQueryDevtools =
  process.env.NODE_ENV === "production"
    ? () => null
    : React.lazy(() =>
        import("@tanstack/react-query-devtools").then((mod) => ({
          default: mod.ReactQueryDevtools,
        })),
      );

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Don't retry auth/permission/not-found errors — retrying won't fix a 401/403/404.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <React.Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
      </React.Suspense>
    </QueryClientProvider>
  );
}
