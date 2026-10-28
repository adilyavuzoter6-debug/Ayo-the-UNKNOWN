"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { ApiError } from "@/lib/api-error";
import { OfflineQueueProvider } from "@/components/providers/offline-queue-provider";

const CACHE_KEY = "piscatio.query-cache";
/** How long data seen online stays viewable offline. */
const OFFLINE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const persister =
  typeof window === "undefined"
    ? null
    : createAsyncStoragePersister({
        key: CACHE_KEY,
        storage: { getItem: get, setItem: set, removeItem: del },
        throttleTime: 2_000,
      });

/**
 * Keeps everything the user has looked at in IndexedDB, so it stays viewable when the
 * connection drops. Scoped to the signed-in Clerk user (the `buster` discards another user's
 * cache on restore) and wiped on sign-out, so a shared device never shows someone else's farms.
 */
function usePersistedCache(client: QueryClient) {
  const { isLoaded, userId } = useAuth();

  React.useEffect(() => {
    if (!persister || !isLoaded) return;
    if (!userId) {
      client.clear();
      void persister.removeClient();
      return;
    }
    const [unsubscribe] = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: OFFLINE_CACHE_MAX_AGE_MS,
      buster: userId,
    });
    return unsubscribe;
  }, [client, isLoaded, userId]);
}

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
            // Must outlive the persisted cache, or queries are garbage-collected before they can
            // be written to (or restored from) IndexedDB.
            gcTime: OFFLINE_CACHE_MAX_AGE_MS,
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
  usePersistedCache(client);

  return (
    <QueryClientProvider client={client}>
      <OfflineQueueProvider>{children}</OfflineQueueProvider>
      <React.Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
      </React.Suspense>
    </QueryClientProvider>
  );
}
