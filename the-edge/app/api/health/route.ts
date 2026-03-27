/**
 * Health check endpoint for monitoring.
 * GET /api/health → detailed system health with dependency checks.
 *
 * Returns:
 * {
 *   status: "ok" | "degraded",
 *   version: string,
 *   uptime_s: number,
 *   environment: string,
 *   timestamp: string,
 *   dependencies: {
 *     supabase: "ok" | "error",
 *     anthropic: "configured" | "missing"
 *   },
 *   tokenStats: { [model]: { input_tokens, output_tokens, requests } }
 * }
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTokenStats } from "@/lib/anthropic";
import { logger } from "@/lib/logger";

// Module-level start timestamp (survives across requests in the same cold start)
const startedAt = Date.now();

// Read version from package.json at module load time
let appVersion = "unknown";
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require("../../../package.json");
  appVersion = pkg.version ?? "unknown";
} catch {
  // package.json not resolvable at runtime (edge runtime, etc.)
}

export async function GET() {
  const uptimeS = Math.floor((Date.now() - startedAt) / 1000);

  // Check Supabase connectivity
  let supabaseStatus: "ok" | "error" = "error";
  try {
    // Lightweight query — just check the connection works
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .limit(1);
    supabaseStatus = error ? "error" : "ok";
  } catch {
    supabaseStatus = "error";
  }

  // Check Anthropic API key presence
  const anthropicStatus: "configured" | "missing" = process.env.ANTHROPIC_API_KEY
    ? "configured"
    : "missing";

  const overallStatus = supabaseStatus === "ok" && anthropicStatus === "configured"
    ? "ok"
    : "degraded";

  if (overallStatus === "degraded") {
    logger.warn("Health check degraded", {
      phase: "health",
      supabase: supabaseStatus,
      anthropic: anthropicStatus,
    });
  }

  return NextResponse.json({
    status: overallStatus,
    version: appVersion,
    uptime_s: uptimeS,
    environment: process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    dependencies: {
      supabase: supabaseStatus,
      anthropic: anthropicStatus,
    },
    tokenStats: getTokenStats(),
  });
}
