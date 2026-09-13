import express, { Application, Request, Response } from "express";
import cookieParser from "cookie-parser";
import prisma from "./lib/prisma.js";
import redis from "./lib/redis.js";
import arcjetMiddleware from "./middlewares/arcjet.middleware.js";
import { redisCache } from "./middlewares/redis.middleware.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";

const app: Application = express();

// Security and standard request parsing middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Security headers middleware
app.use((_req: Request, res: Response, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// Arcjet Security Middleware: Shield (WAF/OWASP), Bot Detection, and Sliding Window Rate Limiting
app.use(arcjetMiddleware);

/**
 * Health check handler (verifies PostgreSQL and Redis connectivity)
 */
const healthCheckHandler = async (_req: Request, res: Response) => {
  let dbStatus = "disconnected";
  let redisStatus = "disconnected";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = `error: ${(err as Error).message}`;
  }

  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
    const pong = await redis.ping();
    if (pong === "PONG") {
      redisStatus = "connected";
    }
  } catch (err) {
    redisStatus = `error: ${(err as Error).message}`;
  }

  const isHealthy = dbStatus === "connected" && redisStatus === "connected";

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      server: "running",
      postgres: dbStatus,
      redis: redisStatus,
    },
  });
};

// Top-level / Infrastructure health check (used by Docker container healthcheck)
app.get("/health", healthCheckHandler);

// Root information endpoint (cached in Redis for 120s)
app.get("/", redisCache({ ttlSeconds: 120 }), (_req: Request, res: Response) => {
  res.json({
    name: "TalkAppServer API",
    version: "1.0.0",
    docs: "/api/v1",
  });
});

// ==========================================
// API Route Versioning: v1 Router
// ==========================================
const v1Router = express.Router();

v1Router.get("/", redisCache({ ttlSeconds: 120 }), (_req: Request, res: Response) => {
  res.json({
    status: "online",
    message: "TalkAppServer API v1 is operational",
    version: "1.0.0",
  });
});

v1Router.get("/health", healthCheckHandler);

// Mounting point for upcoming feature routes:
// v1Router.use("/auth", authRouter);
// v1Router.use("/users", userRouter);
// v1Router.use("/messages", messageRouter);

// Mount versioned API routes
app.use("/api/v1", v1Router);

// 404 Catch-All Handler for unmatched routes
app.use(notFoundHandler);

// Centralized Global Error Handling Middleware
app.use(errorHandler);

export default app;
