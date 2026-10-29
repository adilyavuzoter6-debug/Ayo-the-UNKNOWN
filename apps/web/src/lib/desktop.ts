import * as React from "react";

/** Exposed by the Piscatio desktop app's preload script (apps/desktop/src/preload.js). */
interface PiscatioDesktopBridge {
  /** Opens sign-in in the system browser; the app finishes signing in when the browser hands back. */
  signInInBrowser: () => void;
}

declare global {
  interface Window {
    piscatioDesktop?: PiscatioDesktopBridge;
  }
}

const noopSubscribe = () => () => {};

/** True when running inside the Piscatio desktop app rather than a browser. */
export function useDesktopBridge(): PiscatioDesktopBridge | null {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => window.piscatioDesktop ?? null,
    () => null,
  );
}
