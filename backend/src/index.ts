/**
 * The Edge — API Server
 *
 * Hono-based TypeScript API serving the native iOS and web clients.
 * All routes are versioned under /v1.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { requestLogger } from "./middleware/logging.js";
import { errorHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import statusRoutes from "./routes/status.js";
import sessionRoutes from "./routes/session.js";
import subscriptionRoutes from "./routes/subscription.js";
import type { AppEnv } from "./types/env.js";

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use("*", cors({
  origin: ["http://localhost:3000", "http://localhost:5173"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Refresh-Token"],
  exposeHeaders: [
    "X-Concept-Id",
    "X-Concept-Name",
    "X-Concept-Domain",
    "X-Character",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
  ],
  maxAge: 86400,
}));

app.use("*", requestLogger);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// API v1 routes
// ---------------------------------------------------------------------------

app.route("/v1/auth", authRoutes);
app.route("/v1/profile", profileRoutes);
app.route("/v1/status", statusRoutes);
app.route("/v1/session", sessionRoutes);
app.route("/v1/subscription", subscriptionRoutes);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.onError(errorHandler);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: `Route ${c.req.method} ${c.req.path} not found` },
    },
    404
  );
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(JSON.stringify({ level: "info", message: "Server starting", version: "1.0.0", port, timestamp: new Date().toISOString() }));

serve({ fetch: app.fetch, port });

export default app;
