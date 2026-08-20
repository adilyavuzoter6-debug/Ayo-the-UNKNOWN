"use client";

import * as React from "react";

const STORAGE_KEY = "aquai.activeCompanyId";

interface ActiveCompanyContextValue {
  companyId: string | null;
  setCompanyId: (companyId: string | null) => void;
  /** True once the value has been read from localStorage (avoids a hydration flash). */
  isReady: boolean;
}

const ActiveCompanyContext = React.createContext<ActiveCompanyContextValue | null>(null);

/**
 * Holds the company the user is currently acting as, sent as the X-Company-Id header on every
 * API request (see src/lib/api-client.ts and
 * docs/architecture/06-multi-tenant-security.md §6.2 — the header is only a hint; the API
 * re-validates membership server-side on every request regardless of what this stores).
 */
export function ActiveCompanyProvider({ children }: { children: React.ReactNode }) {
  const [companyId, setCompanyIdState] = React.useState<string | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Reads from localStorage (an external system, unavailable during SSR) once on mount.
    // Doing this in the lazy useState initializer instead would read a value the server never
    // saw, causing a hydration mismatch — the effect + isReady flag renders identically on
    // server and first client paint, then syncs after mount.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompanyIdState(stored);
    setIsReady(true);
  }, []);

  const setCompanyId = React.useCallback((next: string | null) => {
    setCompanyIdState(next);
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = React.useMemo(
    () => ({ companyId, setCompanyId, isReady }),
    [companyId, setCompanyId, isReady],
  );

  return (
    <ActiveCompanyContext.Provider value={value}>{children}</ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const ctx = React.useContext(ActiveCompanyContext);
  if (!ctx) {
    throw new Error("useActiveCompany must be used within an ActiveCompanyProvider.");
  }
  return ctx;
}
