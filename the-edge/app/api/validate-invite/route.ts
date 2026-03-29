/**
 * Validates an invite code for signup.
 * POST { code: string }
 * Returns 200 if valid, 403 if invalid.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { timingSafeEqual } from "crypto";

async function handler(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.code || typeof body.code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const validCode = process.env.EDGE_INVITE_CODE;
  if (!validCode) {
    // No invite code configured — allow all signups
    return NextResponse.json({ valid: true });
  }

  // Use timing-safe comparison to prevent brute-force character-by-character attacks
  const a = Buffer.from(body.code.trim());
  const b = Buffer.from(validCode.trim());
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
  }

  return NextResponse.json({ valid: true });
}

// Rate limit: 5 attempts per minute to prevent brute-forcing invite codes
export const POST = withRateLimit(handler, 5);
