/**
 * Unit tests for custom error types.
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  TierLimitError,
  AIServiceError,
} from "../../src/types/errors.js";

describe("Error hierarchy", () => {
  it("AppError should set code, message, and statusCode", () => {
    const err = new AppError("TEST_ERROR", "Something went wrong", 418);
    expect(err.code).toBe("TEST_ERROR");
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(418);
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("AuthError should default to 401", () => {
    const err = new AuthError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTH_ERROR");
    expect(err).toBeInstanceOf(AppError);
  });

  it("ForbiddenError should default to 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("NotFoundError should include resource name", () => {
    const err = new NotFoundError("User profile");
    expect(err.message).toBe("User profile not found");
    expect(err.statusCode).toBe(404);
  });

  it("RateLimitError should include retryAfter", () => {
    const err = new RateLimitError(30);
    expect(err.retryAfter).toBe(30);
    expect(err.statusCode).toBe(429);
  });

  it("ValidationError should default to 400", () => {
    const err = new ValidationError("Invalid input");
    expect(err.statusCode).toBe(400);
  });

  it("TierLimitError should default to 403", () => {
    const err = new TierLimitError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("TIER_LIMIT");
  });

  it("AIServiceError should default to 502", () => {
    const err = new AIServiceError();
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("AI_ERROR");
  });
});
