"use client";

import { useEffect } from "react";

/** Build ID used to force SW updates on each deploy. */
const BUILD_ID =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
  String(Date.now());

/**
 * Show a brief "App updated" toast that auto-dismisses after 3 seconds.
 */
function showUpdateToast() {
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  toast.textContent = "App updated";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1a1a1a",
    color: "#fff",
    padding: "10px 24px",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily:
      "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontWeight: "500",
    zIndex: "99999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s ease",
    opacity: "0",
  });
  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // Fade out and remove after 3s
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Prompt a waiting service worker to activate and show a toast.
 */
function activateWaitingSW(waiting: ServiceWorker) {
  waiting.postMessage({ type: "CHECK_UPDATE" });
  showUpdateToast();
}

/**
 * Registers the service worker for offline support with update detection.
 * Renders nothing — side-effect only.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const regPromise = navigator.serviceWorker
      .register(`/sw.js?v=${BUILD_ID}`)
      .then((registration) => {
        // If a new SW is already waiting, activate it immediately
        if (registration.waiting) {
          activateWaitingSW(registration.waiting);
          return;
        }

        // Listen for a new SW arriving
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          if (!incoming) return;

          incoming.addEventListener("statechange", () => {
            if (
              incoming.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New SW installed while an older one controls the page
              activateWaitingSW(incoming);
            }
          });
        });

        // Periodically check for updates (every 60 minutes)
        intervalId = setInterval(
          () => {
            registration.update().catch(() => {});
          },
          60 * 60 * 1000,
        );
      })
      .catch(() => {
        // SW registration failed — non-critical
      });

    // When the new SW takes over, show toast instead of hard-reloading.
    // Hard reload during a session loses in-flight state.
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      showUpdateToast();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      // Registration listeners are on the SW registration object which gets GC'd
      void regPromise; // ensure promise is consumed
    };
  }, []);

  return null;
}
