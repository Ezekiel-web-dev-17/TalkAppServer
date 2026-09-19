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

const server = app.listen(serverPort, () => {
  logger.info(`Server running in ${NODE_ENV || "development"} mode on port ${serverPort}`);
});

// Initialize Socket.io real-time WebSocket server
initSocket(server);
logger.info("Real-time WebSocket server initialized.");

const gracefulShutdown = async () => {
  logger.info("Initiating graceful shutdown...");
  server.close(async () => {
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

