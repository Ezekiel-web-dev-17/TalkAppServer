import { PORT, NODE_ENV } from "./config/env.config.js";
import app from "./app.js";
import prisma from "./lib/prisma.js";
import redis from "./lib/redis.js";
import { connectMongoDB, disconnectMongoDB } from "./lib/mongo.js";
import logger from "./lib/logger.js";

const serverPort = PORT || 5000;

// Connect to MongoDB (if MONGODB_URI is provided)
connectMongoDB();

import { initSocket } from "./lib/socket.js";
import { attachmentWorker } from "./workers/attachment.worker.js";
import { attachmentQueue } from "./queues/attachment.queue.js";

const server = app.listen(serverPort, () => {
  logger.info(`Server running in ${NODE_ENV || "development"} mode on port ${serverPort}`);
  logger.info("BullMQ attachment upload worker running.");
});

// Initialize Socket.io real-time WebSocket server
initSocket(server);
logger.info("Real-time WebSocket server initialized.");

const gracefulShutdown = async () => {
  logger.info("Initiating graceful shutdown...");
  server.close(async () => {
    try {
      await attachmentWorker.close();
      await attachmentQueue.close();
      logger.info("BullMQ attachment worker and queue closed.");
    } catch (err) {
      logger.error("Error closing BullMQ:", err);
    }
    await prisma.$disconnect();
    redis.disconnect();
    await disconnectMongoDB();
    logger.info("Server and database connections closed.");
    process.exit(0);
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default server;

