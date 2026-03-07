/**
 * Root layout — warm cream PWA shell with DM Sans font.
 * Tiimo-inspired design: soft, rounded, colourful.
 */

import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "./sw-register";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
