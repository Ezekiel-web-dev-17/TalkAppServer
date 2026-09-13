import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "./lib/prisma.js";
import redis from "./lib/redis.js";
import mongoose from "./lib/mongo.js";
import { CLIENT_URL, NODE_ENV } from "./config/env.config.js";
import requestLogger from "./middlewares/logger.middleware.js";
import arcjetMiddleware from "./middlewares/arcjet.middleware.js";
import { redisCache } from "./middlewares/redis.middleware.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";

const app: Application = express();

// Security Headers Middleware
app.use((_req: Request, res: Response, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// CORS Configuration
const allowedOrigins = [
  CLIENT_URL || "http://localhost:3000",
  "http://localhost:5173", // Vite default dev server
  "http://localhost:3000", // React / Next.js default dev server
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(new Error("Blocked by CORS policy"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

// Standard Request Parsing Middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Winston HTTP Request Logging Middleware
app.use(requestLogger);

// Arcjet Security Middleware: Shield (WAF/OWASP), Bot Detection, and Sliding Window Rate Limiting
app.use(arcjetMiddleware);

/**
 * Health check handler (verifies PostgreSQL, Redis, and MongoDB connectivity)
 */
const healthCheckHandler = async (_req: Request, res: Response) => {
  let dbStatus = "disconnected";
  let redisStatus = "disconnected";
  let mongoStatus = "disconnected";

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

  if (mongoose.connection.readyState === 1) {
    mongoStatus = "connected";
  } else if (mongoose.connection.readyState === 2) {
    mongoStatus = "connecting";
  } else if (!process.env.MONGODB_URI) {
    mongoStatus = "not_configured";
  }

  const isHealthy =
    dbStatus === "connected" &&
    redisStatus === "connected" &&
    (mongoStatus === "connected" || mongoStatus === "not_configured");

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      server: "running",
      postgres: dbStatus,
      redis: redisStatus,
      mongodb: mongoStatus,
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
