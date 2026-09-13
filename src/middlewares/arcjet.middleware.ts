import { Request, Response, NextFunction } from "express";
import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";
import { ARCJET_KEY, NODE_ENV } from "../config/env.config.js";

/**
 * Arcjet Client with the optimal security configuration:
 * 1. Shield: Protects against OWASP Top 10, SQLi, XSS, SSRF, Path Traversal
 * 2. Bot Detection: Blocks scrapers & bad bots while allowing search engines
 * 3. Rate Limiting: Sliding window rate limit (100 requests / 60 seconds per IP)
 */
export const aj = ARCJET_KEY
  ? arcjet({
      key: ARCJET_KEY,
      rules: [
        shield({
          mode: "LIVE",
        }),
        detectBot({
          mode: "LIVE",
          allow: [
            "CATEGORY:SEARCH_ENGINE",
            "CATEGORY:MONITOR",
            "CATEGORY:PREVIEW",
            "CURL",
            "POSTMAN",
          ],
        }),
        slidingWindow({
          mode: "LIVE",
          interval: "1m",
          max: 100,
        }),
      ],
    })
  : null;

let hasWarnedMissingKey = false;

/**
 * Express Middleware to enforce Arcjet security protection on incoming requests.
 */
export const arcjetMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // If no Arcjet key is provided:
  // In development, warn once and pass through without failing local work.
  // In production, log a critical warning.
  if (!aj) {
    if (!hasWarnedMissingKey) {
      if (NODE_ENV === "production") {
        console.error("🚨 [ARCJET] ARCJET_KEY is missing in production! Security protection is inactive.");
      } else {
        console.warn("⚠️ [ARCJET] ARCJET_KEY is not set. Skipping Arcjet protection in development.");
      }
      hasWarnedMissingKey = true;
    }
    return next();
  }

  try {
    const decision = await aj.protect(req);

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        res.status(429).json({
          success: false,
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please try again in a minute.",
        });
        return;
      }

      if (decision.reason.isBot()) {
        res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Access denied: automated bot traffic detected.",
        });
        return;
      }

      if (decision.reason.isShield()) {
        res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Access denied: suspicious request blocked by security shield.",
        });
        return;
      }

      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Access denied by security policy.",
      });
      return;
    }

    next();
  } catch (err) {
    // Fail-open strategy: Do not bring down the entire app if Arcjet service times out or errors
    console.error("⚠️ [ARCJET] Error evaluating request decision:", (err as Error).message);
    next();
  }
};

export default arcjetMiddleware;
