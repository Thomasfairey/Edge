/**
 * Root layout — warm cream PWA shell with DM Sans font.
 * Tiimo-inspired design: soft, rounded, colourful.
 */

import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import ErrorBoundary from "./components/ErrorBoundary";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5A52E0",
};

export const metadata: Metadata = {
  title: "The Edge",
  description: "AI-Powered Influence Mastery System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Edge",
  },
};

/** Clean up legacy service workers and stale caches from earlier PWA builds. */
function LegacySwCleanup() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(sw){sw.unregister()})});caches.keys().then(function(k){k.forEach(function(c){caches.delete(c)})})}`,
      }}
    />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ backgroundColor: "#FAF9F6", colorScheme: "light" }}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${dmSans.className} bg-background text-primary antialiased`} style={{ backgroundColor: "#FAF9F6" }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-xl focus:bg-[#5A52E0] focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <ErrorBoundary>
          <div id="main-content">
            {children}
          </div>
        </ErrorBoundary>
        <LegacySwCleanup />
      </body>
    </html>
  );
}
