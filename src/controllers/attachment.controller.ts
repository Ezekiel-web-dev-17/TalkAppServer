import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { createPresignedUploadUrl } from "../lib/s3.js";
import { AttachmentPresignedUrlInput } from "../schemas/attachment.schema.js";

/**
 * POST /api/v1/attachments/presigned-url
 * Generate a presigned S3 upload URL for direct client-to-S3 attachment uploads.
 */
export const getAttachmentPresignedUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.auth.dbUser.id;
    const { fileName, mimeType, sizeBytes, conversationId } =
      req.body as AttachmentPresignedUrlInput;

    // Verify conversation existence and user membership
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!membership) {
      throw ApiError.forbidden(
        "You must be an active member of this conversation to upload attachments."
      );
    }

    // Generate presigned PUT URL and destination file URL
    const result = await createPresignedUploadUrl({
      fileName,
      mimeType,
      sizeBytes,
      conversationId,
      userId,
    });

    res.status(200).json({
      success: true,
      message: "Presigned upload URL generated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
