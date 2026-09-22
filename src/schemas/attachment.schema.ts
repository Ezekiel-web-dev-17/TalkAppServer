import { z } from "zod";
import { MAX_ATTACHMENT_SIZE_BYTES } from "../lib/s3.js";

/**
 * Validation schema for requesting a presigned S3 upload URL
 */
export const AttachmentPresignedUrlSchema = z.object({
  fileName: z
    .string()
    .min(1, "File name is required")
    .max(255, "File name too long")
    .trim(),
  mimeType: z
    .string()
    .min(1, "MIME type is required")
    .max(100, "MIME type too long")
    .trim(),
  sizeBytes: z
    .number()
    .int("File size must be an integer")
    .positive("File size must be greater than zero")
    .max(
      MAX_ATTACHMENT_SIZE_BYTES,
      `File size cannot exceed ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB`
    ),
  conversationId: z
    .string()
    .min(1, "Conversation ID is required"),
});

export type AttachmentPresignedUrlInput = z.infer<typeof AttachmentPresignedUrlSchema>;
