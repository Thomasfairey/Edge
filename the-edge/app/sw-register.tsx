"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for offline support.
 * Renders nothing — side-effect only.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed — non-critical
      });
    }
  }, []);

  return null;
}
