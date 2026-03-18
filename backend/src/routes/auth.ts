/**
 * Authentication routes — signup, login, Apple Sign-In.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { adminClient } from "../db/client.js";
import { SignupSchema, LoginSchema, AppleSignInSchema } from "../types/api.js";
import { AppError } from "../types/errors.js";

const auth = new Hono();

/**
 * POST /v1/auth/signup
 */
auth.post("/signup", zValidator("json", SignupSchema), async (c) => {
  const { email, password, display_name } = c.req.valid("json");

  const { data, error } = await adminClient.auth.signUp({
    email,
    password,
    options: {
      data: { display_name },
    },
  });

  if (error) {
    throw new AppError("AUTH_SIGNUP_FAILED", error.message, 400);
  }

  return c.json({
    success: true,
    data: {
      user: { id: data.user?.id, email: data.user?.email },
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }
        : null,
    },
  });
});

/**
 * POST /v1/auth/login
 */
auth.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const { data, error } = await adminClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new AppError("AUTH_LOGIN_FAILED", error.message, 401);
  }

  return c.json({
    success: true,
    data: {
      user: { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    },
  });
});

/**
 * POST /v1/auth/refresh
 */
auth.post("/refresh", async (c) => {
  const refreshToken = c.req.header("X-Refresh-Token");
  if (!refreshToken) {
    throw new AppError("MISSING_REFRESH_TOKEN", "X-Refresh-Token header required", 400);
  }

  const { data, error } = await adminClient.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error) {
    throw new AppError("AUTH_REFRESH_FAILED", error.message, 401);
  }

  return c.json({
    success: true,
    data: {
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at,
      },
    },
  });
});

/**
 * POST /v1/auth/apple
 * Apple Sign-In with ID token
 */
auth.post("/apple", zValidator("json", AppleSignInSchema), async (c) => {
  const { id_token, nonce } = c.req.valid("json");

  const { data, error } = await adminClient.auth.signInWithIdToken({
    provider: "apple",
    token: id_token,
    nonce,
  });

  if (error) {
    throw new AppError("AUTH_APPLE_FAILED", error.message, 401);
  }

  return c.json({
    success: true,
    data: {
      user: { id: data.user.id, email: data.user.email },
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }
        : null,
    },
  });
});

export default auth;
