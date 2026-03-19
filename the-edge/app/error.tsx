"use client";

/**
 * Next.js App Router error boundary — catches unhandled errors at page level.
 * Displays a branded error screen with a retry button.
 * Separate from the component-level ErrorBoundary.tsx.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 bg-[#FAF9F6]">
      <div className="rounded-3xl bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.06)] text-center max-w-sm w-full">
        <div className="mb-4 text-4xl">
          <span role="img" aria-hidden="true" style={{ filter: "grayscale(1)" }}>
            &#x26A0;
          </span>
        </div>
        <p className="text-lg font-semibold text-[#2D2B3D] mb-2">
          Something went wrong
        </p>
        <p className="text-sm text-[#8E8C99] mb-6">
          An unexpected error occurred. Your progress has been saved.
        </p>
        <button
          onClick={reset}
          className="rounded-2xl bg-[#5A52E0] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4A43C0] active:bg-[#3D37A0]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
