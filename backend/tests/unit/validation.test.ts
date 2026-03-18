/**
 * Unit tests for Zod validation schemas.
 */

import { describe, it, expect } from "vitest";
import {
  SignupSchema,
  LoginSchema,
  AppleSignInSchema,
  UpdateProfileSchema,
  OnboardingSchema,
  CheckinSchema,
  RoleplayMessageSchema,
  CoachRequestSchema,
  DebriefRequestSchema,
  RetrievalBridgeSchema,
  VerifyReceiptSchema,
} from "../../src/types/api.js";

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

describe("SignupSchema", () => {
  it("should accept valid signup data", () => {
    const result = SignupSchema.safeParse({
      email: "test@example.com",
      password: "securepassword123",
      display_name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid email", () => {
    const result = SignupSchema.safeParse({
      email: "not-an-email",
      password: "securepassword123",
      display_name: "Test User",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short password", () => {
    const result = SignupSchema.safeParse({
      email: "test@example.com",
      password: "short",
      display_name: "Test User",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty display name", () => {
    const result = SignupSchema.safeParse({
      email: "test@example.com",
      password: "securepassword123",
      display_name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("should accept valid login data", () => {
    const result = LoginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing password", () => {
    const result = LoginSchema.safeParse({
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("AppleSignInSchema", () => {
  it("should accept id_token with optional nonce", () => {
    expect(AppleSignInSchema.safeParse({ id_token: "abc123" }).success).toBe(true);
    expect(
      AppleSignInSchema.safeParse({ id_token: "abc123", nonce: "xyz" }).success
    ).toBe(true);
  });

  it("should reject empty id_token", () => {
    expect(AppleSignInSchema.safeParse({ id_token: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Profile schemas
// ---------------------------------------------------------------------------

describe("OnboardingSchema", () => {
  it("should accept valid onboarding data", () => {
    const result = OnboardingSchema.safeParse({
      display_name: "Tom Fairey",
      professional_context: "CRO at a Series A AI company, leading enterprise sales into UK banks.",
      experience_level: "advanced",
      goals: ["Improve negotiation skills", "Master frame control"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject short professional context", () => {
    const result = OnboardingSchema.safeParse({
      display_name: "Tom",
      professional_context: "Short",
      experience_level: "beginner",
      goals: ["Learn"],
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid experience level", () => {
    const result = OnboardingSchema.safeParse({
      display_name: "Tom",
      professional_context: "A sufficiently long professional context.",
      experience_level: "expert",
      goals: ["Learn"],
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty goals array", () => {
    const result = OnboardingSchema.safeParse({
      display_name: "Tom",
      professional_context: "A sufficiently long professional context.",
      experience_level: "beginner",
      goals: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateProfileSchema", () => {
  it("should accept partial updates", () => {
    expect(UpdateProfileSchema.safeParse({ display_name: "New Name" }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ experience_level: "advanced" }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({}).success).toBe(true);
  });

  it("should reject too-long professional context", () => {
    const result = UpdateProfileSchema.safeParse({
      professional_context: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Session schemas
// ---------------------------------------------------------------------------

describe("CheckinSchema", () => {
  it("should accept valid checkin response", () => {
    const result = CheckinSchema.safeParse({
      mission_response: "I deployed the mirroring technique in my 1:1 with the VP.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty response", () => {
    expect(CheckinSchema.safeParse({ mission_response: "" }).success).toBe(false);
  });

  it("should reject too-long response", () => {
    expect(
      CheckinSchema.safeParse({ mission_response: "x".repeat(2001) }).success
    ).toBe(false);
  });
});

describe("RoleplayMessageSchema", () => {
  it("should accept valid message", () => {
    const result = RoleplayMessageSchema.safeParse({
      message: "I understand your concerns about the timeline.",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid UUID", () => {
    const result = RoleplayMessageSchema.safeParse({
      message: "Hello",
      session_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("CoachRequestSchema", () => {
  it("should accept valid coach request", () => {
    const result = CoachRequestSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      transcript: [
        { role: "assistant", content: "So you want to discuss pricing?" },
        { role: "user", content: "Yes, I have a proposal." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid role in transcript", () => {
    const result = CoachRequestSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      transcript: [{ role: "system", content: "Invalid role" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("DebriefRequestSchema", () => {
  it("should accept valid session UUID", () => {
    expect(
      DebriefRequestSchema.safeParse({
        session_id: "550e8400-e29b-41d4-a716-446655440000",
      }).success
    ).toBe(true);
  });
});

describe("RetrievalBridgeSchema", () => {
  it("should accept session_id without user_response (first call)", () => {
    const result = RetrievalBridgeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("should accept session_id with user_response (second call)", () => {
    const result = RetrievalBridgeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      user_response: "Reciprocity is the obligation to return favours.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject too-long user_response", () => {
    const result = RetrievalBridgeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      user_response: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Subscription schema
// ---------------------------------------------------------------------------

describe("VerifyReceiptSchema", () => {
  it("should accept valid receipt data", () => {
    const result = VerifyReceiptSchema.safeParse({
      receipt_data: "base64encodedreceiptdata==",
      product_id: "com.theedge.pro.monthly",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty receipt", () => {
    expect(
      VerifyReceiptSchema.safeParse({ receipt_data: "", product_id: "com.theedge.pro" }).success
    ).toBe(false);
  });
});
