/**
 * Root layout — warm cream PWA shell.
 * Tiimo-inspired design: soft, rounded, colourful.
 *
 * DM Sans loaded via next/font for automatic self-hosting and subsetting.
 */

import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import AudioUnlock from "@/app/components/AudioUnlock";
import "./globals.css";
import { ServiceWorkerRegistrar } from "./sw-register";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5A52E0",
};

export const metadata: Metadata = {
  title: { default: "The Edge", template: "%s — The Edge" },
  description: "AI-Powered Influence Mastery System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Edge",
  },
};

/** Register service worker via external script (avoids unsafe-inline CSP). */
function SwRegisterScript() {
  return <script src="/sw-register.js" async />;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable} style={{ backgroundColor: "#FAF9F6", colorScheme: "light" }}>
      <head>
        <meta name="color-scheme" content="light" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans bg-background text-primary antialiased" style={{ backgroundColor: "#FAF9F6" }}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[#5A52E0] focus:px-4 focus:py-2 focus:text-white focus:text-sm">
          Skip to content
        </a>
        <AudioUnlock />
        <div id="main-content">
          {children}
        </div>
        <SwRegisterScript />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
