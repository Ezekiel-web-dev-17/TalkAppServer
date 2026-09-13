import { Request, Response, NextFunction } from "express";
import logger from "../lib/logger.js";

/**
 * HTTP Request Logging Middleware using Winston.
 * Logs method, route, status code, and response time safely without logging sensitive payloads.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const statusCode = res.statusCode;

    const logPayload = {
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip: ip || req.socket.remoteAddress,
    };

    if (statusCode >= 500) {
      logger.error(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logPayload);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logPayload);
    } else {
      logger.http(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logPayload);
    }
  });

  next();
};

export default requestLogger;
