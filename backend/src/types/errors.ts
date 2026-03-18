/**
 * Application error types for consistent error handling.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message: string = "Authentication required") {
    super("AUTH_ERROR", message, 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Access denied") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  constructor(
    public readonly retryAfter: number
  ) {
    super("RATE_LIMITED", `Rate limit exceeded. Retry after ${retryAfter}s`, 429);
    this.name = "RateLimitError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
    this.name = "ValidationError";
  }
}

export class TierLimitError extends AppError {
  constructor(message: string = "Upgrade to Pro to access this feature") {
    super("TIER_LIMIT", message, 403);
    this.name = "TierLimitError";
  }
}

export class AIServiceError extends AppError {
  constructor(message: string = "AI service temporarily unavailable") {
    super("AI_ERROR", message, 502);
    this.name = "AIServiceError";
  }
}
