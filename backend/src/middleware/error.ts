/**
 * Global error handler middleware.
 * Converts AppError instances to structured JSON responses.
 */

import { Context } from "hono";
import { AppError } from "../types/errors.js";

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    const logEntry = {
      level: "error",
      code: err.code,
      message: err.message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    };
    console.error(JSON.stringify(logEntry));
    return c.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 429 | 500 | 502
    );
  }

  // Unexpected errors
  const logEntry = {
    level: "error",
    code: "INTERNAL_ERROR",
    message: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(logEntry));
  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500
  );
}
