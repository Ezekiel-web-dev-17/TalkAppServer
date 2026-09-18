// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import { createClerkClient } from "@clerk/backend";
import { CLERK_SECRET_KEY } from "../config/env.config.js";
import { ApiError } from "./error.middleware.js";

// Create the Clerk client instance (singleton)
const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

/**
 * Extend Express's Request type to include Clerk auth data
 * and the resolved database user profile.
 */
declare global {
  namespace Express {
    interface Request {
      auth: {
        clerkUserId: string;
        sessionId: string;
      };
    }
  }
}

/**
 * requireAuth — Protects a route by verifying the Clerk session token.
 *
 * Reads the Authorization: Bearer <token> header.
 * On success: attaches { clerkUserId, sessionId } to req.auth
 * On failure: returns 401 Unauthorized
 */
export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("No authentication token provided"));
  }

  const token = authHeader.split(" ")[1];

  try {
    // Clerk verifies the JWT cryptographically using your secret key
    const session = await clerk.verifyToken(token);

    req.auth = {
      clerkUserId: session.sub,   // Clerk user ID (e.g. "user_2abc123...")
      sessionId: session.sid,
    };

    next();
  } catch (err) {
    next(ApiError.unauthorized("Invalid or expired authentication token"));
  }
};