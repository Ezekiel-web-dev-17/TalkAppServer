import mongoose from "mongoose";
import { MONGODB_URI } from "../config/env.config.js";

const uri = MONGODB_URI || process.env.MONGODB_URI;

/**
 * Connect to MongoDB instance using Mongoose.
 * If MONGODB_URI is not provided, logs a warning and gracefully skips.
 */
export const connectMongoDB = async (): Promise<void> => {
  if (!uri) {
    console.warn("⚠️ MONGODB_URI is not defined in environment variables. MongoDB connection skipped.");
    return;
  }

  // Already connected or connecting
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected successfully.");
  } catch (err) {
    console.error("MongoDB connection error:", (err as Error).message);
  }
};

/**
 * Disconnect from MongoDB gracefully on server shutdown.
 */
export const disconnectMongoDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("MongoDB disconnected.");
  }
};

mongoose.connection.on("error", (err: Error) => {
  console.error("MongoDB connection error event:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost/disconnected.");
});

export { mongoose };
export default mongoose;
