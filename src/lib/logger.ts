import winston from "winston";
import path from "path";
import { NODE_ENV } from "../config/env.config.js";

const isProduction = NODE_ENV === "production";

// Define custom log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

// Development console format: colorful & readable
const devConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level}]: ${message}${metaString}`;
  })
);

// Production format: structured JSON (12-factor standard)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProduction ? prodFormat : devConsoleFormat,
  }),
];

// In production or file-logging environments, write to files
if (isProduction || process.env.ENABLE_FILE_LOGS === "true") {
  const logDir = path.join(process.cwd(), "logs");
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      format: prodFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      format: prodFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
}

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  levels,
  transports,
  exitOnError: false,
});

export default logger;
