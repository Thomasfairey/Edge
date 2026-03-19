/**
 * Health check endpoint for monitoring.
 * GET /api/health → { status: "ok", timestamp: string }
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
