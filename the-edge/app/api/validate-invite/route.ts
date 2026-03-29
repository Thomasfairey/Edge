/**
 * Validates an invite code for signup.
 * POST { code: string }
 * Returns 200 if valid, 403 if invalid.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { withRateLimit } from "@/lib/with-rate-limit";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

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

  if (!safeCompare(body.code.trim(), validCode.trim())) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
  }

  return NextResponse.json({ valid: true });
}

// Rate limit: 5 attempts per minute to prevent brute-forcing invite codes
export const POST = withRateLimit(handler, 5);
