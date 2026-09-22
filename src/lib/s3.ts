import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_NAME,
  AWS_S3_ENDPOINT,
} from "../config/env.config.js";
import { ApiError } from "../middlewares/error.middleware.js";
import logger from "./logger.js";

// Initialize S3 client instance
export const s3Client = new S3Client({
  region: AWS_REGION || "us-east-1",
  endpoint: AWS_S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(AWS_S3_ENDPOINT),
  credentials:
    AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB max size

// Strict MIME type allow-lists
export const ALLOWED_MIME_TYPES: Record<string, "IMAGE" | "AUDIO" | "VIDEO" | "FILE"> = {
  // Images
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "image/svg+xml": "IMAGE",

  // Audio
  "audio/mpeg": "AUDIO",
  "audio/wav": "AUDIO",
  "audio/ogg": "AUDIO",
  "audio/mp4": "AUDIO",
  "audio/aac": "AUDIO",

  // Video
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",

  // Documents & Files
  "application/pdf": "FILE",
  "text/plain": "FILE",
  "application/zip": "FILE",
  "application/msword": "FILE",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "FILE",
  "application/vnd.ms-excel": "FILE",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "FILE",
};

export interface GeneratePresignedUrlOptions {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  conversationId: string;
  userId: string;
}

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  type: "IMAGE" | "AUDIO" | "VIDEO" | "FILE";
  expiresIn: number;
}

/**
 * Generate a cryptographically secure, time-limited presigned PUT URL for uploading attachments to S3.
 */
export async function createPresignedUploadUrl(
  options: GeneratePresignedUrlOptions
): Promise<PresignedUrlResult> {
  const bucket = AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new ApiError(500, "AWS S3 storage is not configured (missing AWS_S3_BUCKET_NAME)");
  }

  const { fileName, mimeType, sizeBytes, conversationId, userId } = options;

  // 1. Validate MIME type
  const normalizedMime = mimeType.toLowerCase().trim();
  const attachmentType = ALLOWED_MIME_TYPES[normalizedMime];
  if (!attachmentType) {
    throw ApiError.badRequest(
      `Unsupported file type '${mimeType}'. Allowed types include common images, audio, video, and documents.`
    );
  }

  // 2. Validate file size
  if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw ApiError.badRequest(
      `File size exceeds the allowable limit of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`
    );
  }

  // 3. Sanitize file name to prevent path traversal & special character injection
  const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const key = `attachments/${conversationId}/${Date.now()}-${randomSuffix}-${baseName}`;

  // 4. Create S3 PutObject command with Content-Type and Content-Length constraints
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: normalizedMime,
    ContentLength: sizeBytes,
    Metadata: {
      userId,
      conversationId,
      originalName: encodeURIComponent(baseName),
    },
  });

  const expiresIn = 900; // 15 minutes validity
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  const region = AWS_REGION || "us-east-1";
  const fileUrl = AWS_S3_ENDPOINT
    ? `${AWS_S3_ENDPOINT.replace(/\/$/, "")}/${bucket}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  logger.info(
    `[S3] Generated presigned upload URL for user ${userId} in conversation ${conversationId}: ${key}`
  );

  return {
    uploadUrl,
    fileUrl,
    key,
    type: attachmentType,
    expiresIn,
  };
}

export interface DirectUploadOptions {
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  conversationId: string;
  userId: string;
}

export interface DirectUploadResult {
  fileUrl: string;
  key: string;
  type: "IMAGE" | "AUDIO" | "VIDEO" | "FILE";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload a local file directly to AWS S3.
 */
export async function uploadFileToS3(
  options: DirectUploadOptions
): Promise<DirectUploadResult> {
  const bucket = AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new ApiError(500, "AWS S3 storage is not configured (missing AWS_S3_BUCKET_NAME)");
  }

  const { filePath, fileName, mimeType, sizeBytes, conversationId, userId } = options;

  // 1. Validate MIME type
  const normalizedMime = mimeType.toLowerCase().trim();
  const attachmentType = ALLOWED_MIME_TYPES[normalizedMime];
  if (!attachmentType) {
    throw ApiError.badRequest(
      `Unsupported file type '${mimeType}'. Allowed types include common images, audio, video, and documents.`
    );
  }

  // 2. Validate file size
  if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw ApiError.badRequest(
      `File size exceeds the allowable limit of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`
    );
  }

  // 3. Sanitize file name to prevent path traversal & special character injection
  const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const key = `attachments/${conversationId}/${Date.now()}-${randomSuffix}-${baseName}`;

  const fileStream = fs.createReadStream(filePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: normalizedMime,
    ContentLength: sizeBytes,
    Metadata: {
      userId,
      conversationId,
      originalName: encodeURIComponent(baseName),
    },
  });

  await s3Client.send(command);

  const region = AWS_REGION || "us-east-1";
  const fileUrl = AWS_S3_ENDPOINT
    ? `${AWS_S3_ENDPOINT.replace(/\/$/, "")}/${bucket}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  logger.info(
    `[S3] Uploaded attachment to S3 for user ${userId} in conversation ${conversationId}: ${key}`
  );

  return {
    fileUrl,
    key,
    type: attachmentType,
    fileName: baseName,
    mimeType: normalizedMime,
    sizeBytes,
  };
}

