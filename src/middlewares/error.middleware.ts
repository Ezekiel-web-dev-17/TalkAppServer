import { Request, Response, NextFunction } from "express";

/**
 * Standard Operational API Error Class
 */
export class ApiError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    details?: unknown,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad Request", details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Unauthorized", details?: unknown): ApiError {
    return new ApiError(401, message, details);
  }

  static forbidden(message = "Forbidden", details?: unknown): ApiError {
    return new ApiError(403, message, details);
  }

  static notFound(message = "Resource Not Found", details?: unknown): ApiError {
    return new ApiError(404, message, details);
  }

  static conflict(message = "Conflict", details?: unknown): ApiError {
    return new ApiError(409, message, details);
  }

  static tooManyRequests(message = "Too Many Requests", details?: unknown): ApiError {
    return new ApiError(429, message, details);
  }

  static internal(message = "Internal Server Error", details?: unknown): ApiError {
    return new ApiError(500, message, details, false);
  }
}

/**
 * 404 Catch-All Middleware for unmatched routes
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`));
};

/**
 * Centralized Global Error Handling Middleware
 * Ensures safe responses compliant with secure web guidelines:
 * - Sanitizes database and Prisma errors
 * - Never leaks internal server stack traces or raw SQL in production
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let details = err.details || undefined;
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Prisma Known Request Errors
  if (err.code && typeof err.code === "string" && err.code.startsWith("P")) {
    switch (err.code) {
      case "P2002": {
        statusCode = 409;
        const target = Array.isArray(err.meta?.target)
          ? err.meta.target.join(", ")
          : (err.meta?.target as string) || "field";
        message = `A record with this ${target} already exists.`;
        break;
      }
      case "P2025": {
        statusCode = 404;
        message = "The requested database record was not found.";
        break;
      }
      case "P2003": {
        statusCode = 400;
        message = "Invalid reference: foreign key constraint failed.";
        break;
      }
      default: {
        statusCode = 400;
        message = isProduction
          ? "Database operation failed."
          : `Prisma Error [${err.code}]: ${err.message}`;
        break;
      }
    }
  }

  // 2. JWT Authentication Errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authentication token has expired.";
  }

  // 3. JSON Syntax Error (Malformed Request Body)
  if (err instanceof SyntaxError && "body" in err && (err as any).status === 400) {
    statusCode = 400;
    message = "Malformed JSON request body.";
  }

  // Log non-operational (unexpected) server errors
  if (statusCode >= 500) {
    console.error("❌ [UNHANDLED ERROR]:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      status: `${statusCode}`.startsWith("4") ? "fail" : "error",
      statusCode,
      message: statusCode >= 500 && isProduction ? "Internal Server Error" : message,
      ...(details ? { details } : {}),
      ...(!isProduction && err.stack ? { stack: err.stack } : {}),
    },
  });
};
