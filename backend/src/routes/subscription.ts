/**
 * Subscription management routes.
 *
 * POST /v1/subscription/verify  — Verify App Store receipt
 * GET  /v1/subscription/status  — Get subscription status
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { adminClient, createUserClient } from "../db/client.js";
import { authMiddleware, type AuthUser } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { VerifyReceiptSchema } from "../types/api.js";
import { ValidationError } from "../types/errors.js";
import type { AppEnv } from "../types/env.js";
import { verifyAppleReceipt } from "../services/apple-receipt.js";

const subscription = new Hono<AppEnv>();

subscription.use("*", authMiddleware);

/**
 * POST /v1/subscription/verify
 *
 * Verify an App Store receipt and activate the user's subscription.
 * In production, this would call Apple's verifyReceipt endpoint.
 * For now, it accepts the receipt and updates the user's tier.
 */
subscription.post(
  "/verify",
  rateLimit(5),
  zValidator("json", VerifyReceiptSchema),
  async (c) => {
    const user = c.get("user") as AuthUser;
    const { receipt_data, product_id } = c.req.valid("json");

    // Verify receipt with Apple's servers
    const verified = await verifyAppleReceipt(receipt_data, product_id);
    if (!verified.isValid) {
      throw new ValidationError("Receipt is invalid or subscription has expired");
    }

    // Use Apple's expiration date, or default to 1 month if not a subscription
    const expiresAt = verified.expiresDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Upsert subscription record (uses service role to bypass RLS)
    const { error: subError } = await adminClient
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          product_id,
          receipt_data,
          status: "active",
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (subError) {
      throw new ValidationError(`Failed to store subscription: ${subError.message}`);
    }

    // Update user profile tier (uses service role)
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .update({
        subscription_tier: "pro",
        subscription_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      throw new ValidationError(`Failed to update tier: ${profileError.message}`);
    }

    return c.json({
      success: true,
      data: {
        tier: "pro",
        expires_at: expiresAt.toISOString(),
        product_id,
      },
    });
  }
);

/**
 * GET /v1/subscription/status
 */
subscription.get("/status", rateLimit(20), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);

  const { data: profile } = await db
    .from("user_profiles")
    .select("subscription_tier, subscription_expires_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return c.json({
      success: true,
      data: { tier: "free", expires_at: null, is_active: true },
    });
  }

  // Atomic auto-downgrade: expiry check + update in a single SQL WHERE clause
  if (profile.subscription_tier === "pro" && profile.subscription_expires_at) {
    const { data: downgraded } = await adminClient
      .from("user_profiles")
      .update({
        subscription_tier: "free",
        subscription_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .eq("subscription_tier", "pro")
      .lt("subscription_expires_at", new Date().toISOString())
      .select("id");

    if (downgraded && downgraded.length > 0) {
      return c.json({
        success: true,
        data: { tier: "free", expires_at: null, is_active: true },
      });
    }
  }

  return c.json({
    success: true,
    data: {
      tier: profile.subscription_tier,
      expires_at: profile.subscription_expires_at,
      is_active: true,
    },
  });
});

export default subscription;
