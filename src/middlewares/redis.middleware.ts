import { Request, Response, NextFunction } from "express";
import redis from "../lib/redis.js";

export interface CacheOptions {
  /** Time to live in seconds (default: 60s) */
  ttlSeconds?: number;
  /** Custom prefix for the cache key */
  prefix?: string;
}

/**
 * Express Middleware to cache idempotent GET responses in Redis.
 *
 * Safe & Resilient:
 * - If Redis is unavailable or errors out, the request gracefully falls back
 *   to the database/controller without failing the client.
 */
export const redisCache = (options: CacheOptions = {}) => {
  const ttl = options.ttlSeconds ?? 60;
  const prefix = options.prefix ?? "api";

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    const cacheKey = `talkapp:${prefix}:${req.originalUrl || req.url}`;

    try {
      // Check if Redis is ready and has cached data
      if (redis.status === "ready" || redis.status === "connect") {
        const cachedData = await redis.get(cacheKey);

        if (cachedData !== null) {
          res.setHeader("X-Cache", "HIT");
          res.setHeader("Content-Type", "application/json");
          res.send(cachedData);
          return;
        }
      }
    } catch (err) {
      console.warn("⚠️ Redis cache read error (continuing without cache):", (err as Error).message);
    }

    // Cache MISS: Intercept response to store payload on success
    res.setHeader("X-Cache", "MISS");

    const originalSend = res.send.bind(res);

    res.send = (body: any): Response => {
      // Only cache successful 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const stringPayload = typeof body === "string" ? body : JSON.stringify(body);
          // Fire and forget cache write
          redis.set(cacheKey, stringPayload, "EX", ttl).catch((writeErr) => {
            console.warn("⚠️ Redis cache write error:", (writeErr as Error).message);
          });
        } catch {
          // Ignore serialization errors
        }
      }

      return originalSend(body);
    };

    next();
  };
};

/**
 * Utility helper to delete cached keys matching a specific pattern or key.
 *
 * @example
 * await invalidateCache("api:/api/v1/users*");
 */
export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    const fullPattern = pattern.startsWith("talkapp:") ? pattern : `talkapp:${pattern}`;
    const keys = await redis.keys(fullPattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.warn("⚠️ Failed to invalidate cache pattern:", (err as Error).message);
  }
};
