/**
 * Validates an invite code for signup.
 * POST { code: string }
 * Returns 200 if valid, 403 if invalid.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const validCode = process.env.EDGE_INVITE_CODE;
  if (!validCode) {
    // No invite code configured — allow all signups
    return NextResponse.json({ valid: true });
  }

  if (body.code.trim() !== validCode) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
  }

  return NextResponse.json({ valid: true });
}
