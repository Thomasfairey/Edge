/**
 * Health check endpoint for monitoring.
 * GET /api/health → detailed system health with dependency checks.
 *
 * Returns:
 * {
 *   status: "ok" | "degraded",
 *   version: string,
 *   build: { commit: string, branch: string, env: string },
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

/**
 * Which build is actually serving.
 *
 * `version` comes from package.json and has read 0.1.0 since the repo was
 * created, so it cannot distinguish two deploys — asking this endpoint which
 * commit was live meant going to the GitHub deployments API instead, which is
 * the wrong place to have to look. Vercel sets these on the function runtime;
 * off Vercel they are absent and the fields read "unknown", which is honest
 * rather than misleading.
 */
const build = {
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
  branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
  // production | preview | development. Distinguishes the live app from a
  // preview build serving the same code.
  env: process.env.VERCEL_ENV ?? "unknown",
};

export async function GET() {
  const uptimeS = Math.floor((Date.now() - startedAt) / 1000);

  // Check Supabase connectivity
  let supabaseStatus: "ok" | "error" = "error";
  try {
    // Lightweight query — just check the connection works
    const { error } = await supabaseAdmin
      .from("profiles")
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
    build,
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
