import { config } from "dotenv";

config({ path: `.env.${process.env.NODE_ENV ?? "development"}.local` });

export const {
  NODE_ENV,
  PORT,
  DATABASE_URL,
  REDIS_URL,
  JWT_SECRET,
  ARCJET_KEY,
  ARCJET_ENV,
  MONGODB_URI,
  CLIENT_URL,
  CLERK_SECRET_KEY,
  CLERK_PUBLISHABLE_KEY,
  CLERK_WEBHOOK_SECRET,
  MESSAGE_ENCRYPTION_KEY,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_NAME,
  AWS_S3_ENDPOINT,
} = process.env;