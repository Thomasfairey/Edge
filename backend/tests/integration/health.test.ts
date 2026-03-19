/**
 * Integration tests for the health endpoint and app setup.
 * These test the Hono app directly without external dependencies.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock environment variables before any imports
vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");

// Mock the Supabase client to avoid real connections
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithIdToken: vi.fn(),
      refreshSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      lte: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
      stream: vi.fn(),
    },
  })),
  RateLimitError: class extends Error {},
}));

describe("Health endpoint", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;

  beforeAll(async () => {
    const module = await import("../../src/index.js");
    app = module.default;
  });

  it("GET /health should return 200 with status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
    expect(body.timestamp).toBeTruthy();
  });

  it("should return 404 for unknown routes", async () => {
    const res = await app.request("/v1/nonexistent");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("GET /v1/auth/signup should reject GET method (only POST)", async () => {
    const res = await app.request("/v1/auth/signup");
    expect(res.status).toBe(404);
  });
});

describe("Auth routes — validation", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;

  beforeAll(async () => {
    const module = await import("../../src/index.js");
    app = module.default;
  });

  it("POST /v1/auth/signup should reject invalid email", async () => {
    const res = await app.request("/v1/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: "password123",
        display_name: "Test",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /v1/auth/signup should reject short password", async () => {
    const res = await app.request("/v1/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "short",
        display_name: "Test",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /v1/auth/login should reject missing fields", async () => {
    const res = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Protected routes — auth required", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;

  beforeAll(async () => {
    const module = await import("../../src/index.js");
    app = module.default;
  });

  it("GET /v1/status should reject unauthenticated request", async () => {
    const res = await app.request("/v1/status");
    // Should return 401 because no Authorization header
    expect(res.status).toBe(401);
  });

  it("GET /v1/profile should reject unauthenticated request", async () => {
    const res = await app.request("/v1/profile");
    expect(res.status).toBe(401);
  });

  it("POST /v1/session/start should reject unauthenticated request", async () => {
    const res = await app.request("/v1/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("POST /v1/subscription/verify should reject unauthenticated request", async () => {
    const res = await app.request("/v1/subscription/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt_data: "test", product_id: "test" }),
    });
    expect(res.status).toBe(401);
  });
});
