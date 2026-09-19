// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { User } from "@prisma/client";
import { CLERK_SECRET_KEY } from "../config/env.config.js";
import prisma from "../lib/prisma.js";
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
        sessionId?: string;
        dbUser: User;
      };
    }
  }
}

/**
 * requireAuth — Protects a route by verifying the Clerk session token.
 *
 * Reads the Authorization: Bearer <token> header.
 * 1. Verifies the JWT cryptographically via Clerk.
 * 2. Fetches/connects the corresponding user record in the SQL database.
 * 3. Attaches { clerkUserId, sessionId, dbUser } to req.auth.
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
    // 1. Verify token signature and expiration
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return next(ApiError.unauthorized("Invalid token payload: missing subject"));
    }

    // 2. Fetch the SQL database user linked to this clerkId
    let dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    // 3. Fallback: If webhook was delayed or user not yet synced to SQL, fetch from Clerk API and upsert
    if (!dbUser) {
      try {
        const clerkUser = await clerk.users.getUser(clerkUserId);
        const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress;

        if (primaryEmail) {
          const baseUsername =
            clerkUser.username ??
            primaryEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");

          dbUser = await prisma.user.upsert({
            where: { clerkId: clerkUserId },
            update: {},
            create: {
              clerkId: clerkUserId,
              email: primaryEmail,
              username: `${baseUsername}_${clerkUserId.slice(-4)}`,
              name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
              avatarUrl: clerkUser.imageUrl || null,
            },
          });
        }
      } catch (clerkSyncErr) {
        // Fallback sync failed, proceed to handle missing dbUser below
      }
    }

    if (!dbUser) {
      return next(ApiError.unauthorized("User profile not found in database"));
    }

    // 4. Attach auth context & SQL database user to request
    req.auth = {
      clerkUserId,
      sessionId: (payload as Record<string, unknown>).sid as string | undefined,
      dbUser,
    };

    next();
  } catch (err) {
    next(ApiError.unauthorized("Invalid or expired authentication token"));
  }
};