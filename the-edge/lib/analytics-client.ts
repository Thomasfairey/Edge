import type { AnalyticsEvent } from "@/lib/analytics";

export function trackClientEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined") return;
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
    keepalive: true,
  }).catch(() => {});
}
