"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// useSyncExternalStore gives a hydration-safe one-time read: the server
// snapshot renders false, the client snapshot reads the real capability —
// without the setState-in-effect cascade the previous implementation had.
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => "ontouchstart" in window || navigator.maxTouchPoints > 0,
    () => false
  );
}
