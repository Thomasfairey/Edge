import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // 2 years, include subdomains, eligible for browser preload list.
    // Vercel terminates TLS for us so HSTS is safe to set unconditionally.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    // Deny by default; only microphone is permitted on same-origin.
    value:
      "camera=(), geolocation=(), microphone=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: buildCsp(),
  },
];

/**
 * Build the CSP header. Honours `NEXT_PUBLIC_SUPABASE_URL` to scope
 * `connect-src` to the actual project subdomain rather than allowing all of
 * `*.supabase.co`. Falls back to the wildcard if not configured (eg local
 * dev). Realtime websockets need wss://, so we add that variant too.
 */
function buildCsp(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseOrigin = "https://*.supabase.co";
  let supabaseWss = "wss://*.supabase.co";
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      supabaseOrigin = `${u.protocol}//${u.host}`;
      supabaseWss = `wss://${u.host}`;
    } catch {
      // ignore — keep wildcard fallback
    }
  }
  return [
    "default-src 'self'",
    // unsafe-inline is required: Next.js 16 injects inline <script> tags for
    // RSC payload hydration (self.__next_f.push). There is no way to avoid
    // this without nonce-based CSP, which Next.js does not yet support in
    // production.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://api.elevenlabs.io ${supabaseOrigin} ${supabaseWss}`,
    "media-src 'self' blob:",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    // base-uri prevents <base> tag injection from rewriting relative URLs.
    "base-uri 'self'",
    // form-action prevents form posts to attacker domains.
    "form-action 'self'",
    // object-src deny — no flash/silverlight/etc.
    "object-src 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  compiler: {
    // Strip console.log/warn in production builds (keep console.error for debugging)
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error"] }
      : false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["@anthropic-ai/sdk", "@supabase/supabase-js"],
  },
};

export default nextConfig;
