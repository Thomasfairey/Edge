/**
 * Authentication middleware — verifies Supabase JWT and attaches user to context.
 */

import { Context, Next } from "hono";
import { adminClient } from "../db/client.js";
import { AuthError } from "../types/errors.js";
import type { AppEnv } from "../types/env.js";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Middleware that verifies the Authorization header contains a valid Supabase JWT.
 * Attaches the authenticated user to c.set("user", ...) and the raw token to c.set("token", ...).
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token);

  if (error || !user) {
    throw new AuthError("Invalid or expired token");
  }

  c.set("user", { id: user.id, email: user.email } as AuthUser);
  c.set("token", token);

  await next();
}
