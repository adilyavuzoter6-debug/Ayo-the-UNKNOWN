"use client";

import * as React from "react";

/** Registers the no-op service worker (public/sw.js) that makes the site installable as a desktop/home-screen app. */
export function PwaRegister() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
