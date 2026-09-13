import { PORT } from "./config/env.config.js";
import app from "./app.js";
import prisma from "./lib/prisma.js";
import redis from "./lib/redis.js";

const serverPort = PORT || 5000;

const server = app.listen(serverPort, () => {
  console.log(`Server listening on port ${serverPort}`);
});

const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    console.log("Server and connections closed.");
    process.exit(0);
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default server;

