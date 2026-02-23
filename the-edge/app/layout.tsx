/**
 * Root layout — dark minimal theme, full-height, centered content.
 * No navigation bar — single-flow app.
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Edge",
  description: "AI-Powered Influence Mastery System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ backgroundColor: "#0A0A0F" }}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
