"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { get, set } from "idb-keyval";
import { ApiError } from "@/lib/api-error";
import { isOffline, NETWORK_ERROR_CODE, OFFLINE_ERROR_CODE, sendApiRequest } from "@/lib/api-client";

const STORAGE_KEY = "piscatio.offline-queue";
const RETRY_INTERVAL_MS = 30_000;

/**
 * A daily record (feeding, mortality, water quality) captured while the API was unreachable.
 * Its id doubles as the Idempotency-Key, so replaying it after a request that did reach the
 * server only returns the original response instead of booking the record twice.
 */
export interface QueuedRecord {
  id: string;
  userId: string;
  companyId: string;
  path: string;
  body: unknown;
  label: string;
  createdAt: string;
  /** Set when the server rejected the record (e.g. not enough feed left); it then waits for the user. */
  error?: string;
  /** Queries to refresh once the record reaches the server. */
  invalidate: QueryKey[];
}

export const QUEUED_MESSAGE = "İnternet yok — kayıt bu cihazda saklandı, bağlantı gelince otomatik gönderilecek.";

export interface QueuedResult {
  queued: true;
  id: string;
}

export function isQueued(value: unknown): value is QueuedResult {
  return typeof value === "object" && value !== null && (value as QueuedResult).queued === true;
}

type SubmitInput = Pick<QueuedRecord, "companyId" | "path" | "body" | "label" | "invalidate">;

interface OfflineQueueContextValue {
  online: boolean;
  /** The signed-in user's queued records, oldest first. */
  records: QueuedRecord[];
  /** Sends the record now, or queues it when there's no connection. */
  submit: <T>(input: SubmitInput) => Promise<T | QueuedResult>;
  discard: (id: string) => void;
  flush: () => void;
}

const OfflineQueueContext = React.createContext<OfflineQueueContextValue | null>(null);

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus() {
  return React.useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Errors that mean "try again later" rather than "the server said no". */
function isTransient(error: unknown) {
  if (!(error instanceof ApiError)) return true;
  if (error.code === OFFLINE_ERROR_CODE || error.code === NETWORK_ERROR_CODE) return true;
  // 401: token couldn't be refreshed yet; 409: the same key is still in flight; 429/5xx: server-side.
  return error.status === 401 || error.status === 409 || error.status === 429 || error.status >= 500;
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [all, setAll] = React.useState<QueuedRecord[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const allRef = React.useRef(all);
  const flushing = React.useRef(false);

  const update = React.useCallback((next: (current: QueuedRecord[]) => QueuedRecord[]) => {
    const value = next(allRef.current);
    allRef.current = value;
    setAll(value);
    set(STORAGE_KEY, value).catch(() => {});
  }, []);

  React.useEffect(() => {
    get<QueuedRecord[]>(STORAGE_KEY)
      .then((stored) => {
        // Anything queued before storage finished loading goes after what was already stored.
        if (stored?.length) update((current) => [...stored, ...current]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [update]);

  const refresh = React.useCallback(
    (keys: QueryKey[]) => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey })),
    [queryClient],
  );

  const flush = React.useCallback(async () => {
    if (flushing.current || !userId || isOffline()) return;
    flushing.current = true;
    try {
      for (const record of allRef.current.filter((r) => r.userId === userId && !r.error)) {
        try {
          const token = await getToken();
          if (!token) return;
          await sendApiRequest({
            token,
            companyId: record.companyId,
            path: record.path,
            init: { method: "POST", body: JSON.stringify(record.body) },
            idempotencyKey: record.id,
          });
          update((current) => current.filter((r) => r.id !== record.id));
          refresh(record.invalidate);
        } catch (error) {
          // Stop at the first transient failure so records keep reaching the server in order.
          if (isTransient(error)) return;
          const message = error instanceof ApiError ? error.message : "Kayıt gönderilemedi.";
          update((current) => current.map((r) => (r.id === record.id ? { ...r, error: message } : r)));
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [userId, getToken, update, refresh]);

  const records = React.useMemo(() => all.filter((r) => r.userId === userId), [all, userId]);
  const hasSendable = records.some((r) => !r.error);

  React.useEffect(() => {
    if (!loaded || !online || !hasSendable) return;
    void flush();
    const timer = window.setInterval(() => void flush(), RETRY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loaded, online, hasSendable, flush]);

  const submit = React.useCallback(
    async <T,>(input: SubmitInput): Promise<T | QueuedResult> => {
      if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Oturum bulunamadı.");
      const record: QueuedRecord = {
        ...input,
        id: crypto.randomUUID(),
        userId,
        createdAt: new Date().toISOString(),
      };
      const enqueue = (): QueuedResult => {
        update((current) => [...current, record]);
        return { queued: true, id: record.id };
      };

      if (isOffline()) return enqueue();
      try {
        const token = await getToken();
        const result = await sendApiRequest<T>({
          token,
          companyId: record.companyId,
          path: record.path,
          init: { method: "POST", body: JSON.stringify(record.body) },
          idempotencyKey: record.id,
        });
        refresh(record.invalidate);
        return result;
      } catch (error) {
        if (error instanceof ApiError && (error.code === OFFLINE_ERROR_CODE || error.code === NETWORK_ERROR_CODE)) {
          return enqueue();
        }
        throw error;
      }
    },
    [userId, getToken, update, refresh],
  );

  const discard = React.useCallback(
    (id: string) => update((current) => current.filter((r) => r.id !== id)),
    [update],
  );

  const value = React.useMemo(
    () => ({ online, records, submit, discard, flush: () => void flush() }),
    [online, records, submit, discard, flush],
  );

  return <OfflineQueueContext.Provider value={value}>{children}</OfflineQueueContext.Provider>;
}

export function useOfflineQueue() {
  const context = React.useContext(OfflineQueueContext);
  if (!context) throw new Error("useOfflineQueue must be used inside OfflineQueueProvider");
  return context;
}
