import { ConnectionOptions } from "bullmq";
import { REDIS_URL } from "../config/env.config.js";
import logger from "./logger.js";

const redisUrl = REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379";

/**
 * BullMQ connection configuration.
 * By passing connection options rather than a single shared instance,
 * BullMQ manages dedicated client and subscriber connections independently.
 */
export function getBullmqConnectionOptions(): ConnectionOptions {
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  } catch {
    logger.warn("[BullMQ] Invalid REDIS_URL; falling back to localhost:6379");
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

export const bullmqConnection = getBullmqConnectionOptions();
export default bullmqConnection;
