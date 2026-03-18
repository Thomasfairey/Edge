/**
 * Global error handler middleware.
 * Converts AppError instances to structured JSON responses.
 */

import { Context } from "hono";
import { AppError } from "../types/errors.js";

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    console.error(`[${err.code}] ${err.message}`);
    return c.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 429 | 500 | 502
    );
  }

  // Unexpected errors
  console.error("[INTERNAL_ERROR]", err.message, err.stack);
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
