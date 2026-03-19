/**
 * Root layout — warm cream PWA shell.
 * Tiimo-inspired design: soft, rounded, colourful.
 *
 * Uses system font stack with DM Sans as preferred (loaded via CSS)
 * to avoid build failures when Google Fonts is unreachable.
 */

import type { Metadata, Viewport } from "next";
import AudioUnlock from "@/app/components/AudioUnlock";
import "./globals.css";
import { ServiceWorkerRegistrar } from "./sw-register";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#5A52E0",
};

export const metadata: Metadata = {
  title: "The Edge",
  description: "AI-Powered Influence Mastery System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Edge",
  },
};

/** Clean up legacy service workers and stale caches from earlier PWA builds. */
function LegacySwCleanup() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}`,
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
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans bg-background text-primary antialiased" style={{ backgroundColor: "#FAF9F6" }}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[#5A52E0] focus:px-4 focus:py-2 focus:text-white focus:text-sm">
          Skip to content
        </a>
        <AudioUnlock />
        <div id="main-content">
          {children}
        </div>
        <LegacySwCleanup />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
