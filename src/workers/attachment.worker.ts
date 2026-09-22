import { Worker, Job } from "bullmq";
import fs from "node:fs";
import { bullmqConnection } from "../lib/bullmq.js";
import { ATTACHMENT_QUEUE_NAME, AttachmentJobData } from "../queues/attachment.queue.js";
import { uploadFileToS3 } from "../lib/s3.js";
import MessageModel from "../models/message.model.js";
import prisma from "../lib/prisma.js";
import { emitMessageEdited } from "../lib/socket.js";
import logger from "../lib/logger.js";

/**
 * Process an attachment upload job
 */
async function processAttachmentJob(job: Job<AttachmentJobData>): Promise<void> {
  const {
    tempFilePath,
    originalName,
    mimeType,
    sizeBytes,
    messageId,
    conversationId,
    userId,
    action,
    replaceExisting,
  } = job.data;

  logger.info(
    `[BullMQ:Worker] Processing job ${job.id} for message ${messageId} (action: ${action}, file: ${originalName})`
  );

  if (!fs.existsSync(tempFilePath)) {
    throw new Error(`Temporary file does not exist at path: ${tempFilePath}`);
  }

  try {
    // 1. Upload the file from disk to AWS S3
    const uploadResult = await uploadFileToS3({
      filePath: tempFilePath,
      fileName: originalName,
      mimeType,
      sizeBytes,
      conversationId,
      userId,
    });

    const newAttachment = {
      url: uploadResult.fileUrl,
      type: uploadResult.type,
      mimeType: uploadResult.mimeType,
      fileName: uploadResult.fileName,
      sizeBytes: uploadResult.sizeBytes,
    };

    // 2. Fetch and update the Message document in MongoDB
    const message = await MessageModel.findById(messageId);
    if (!message) {
      logger.warn(`[BullMQ:Worker] Message ${messageId} not found in MongoDB`);
      return;
    }

    if (action === "SEND") {
      message.attachments.push(newAttachment);
      // If message had no text content and contentType was TEXT, update contentType to match the attachment
      if (message.contentType === "TEXT" && !message.content) {
        message.contentType = uploadResult.type;
      }
    } else if (action === "UPDATE") {
      if (replaceExisting) {
        message.attachments = [newAttachment];
      } else {
        message.attachments.push(newAttachment);
      }
      message.isEdited = true;
    }

    await message.save();

    // 3. Update PostgreSQL Conversation lastMessage if this message is the most recent
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { lastMessage: true },
      });

      const currentLastMsg = conversation?.lastMessage as Record<string, unknown> | null;
      if (currentLastMsg && (currentLastMsg.id === messageId || !currentLastMsg.id)) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            lastMessage: {
              ...currentLastMsg,
              id: message.id,
              text:
                message.content ||
                message.attachments[0]?.type ||
                "ATTACHMENT",
              contentType: message.contentType,
            },
          },
        });
      }
    } catch (pgErr) {
      logger.error(
        `[BullMQ:Worker] Failed to update PostgreSQL conversation lastMessage: ${(pgErr as Error).message}`
      );
    }

    // 4. Broadcast the updated message to all connected clients in the conversation
    emitMessageEdited(conversationId, message.toJSON());

    logger.info(
      `[BullMQ:Worker] Successfully processed job ${job.id} for message ${messageId} (S3 URL: ${uploadResult.fileUrl})`
    );
  } finally {
    // 5. Always clean up temporary file from disk to prevent storage exhaustion
    try {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
        logger.debug(`[BullMQ:Worker] Deleted temporary file: ${tempFilePath}`);
      }
    } catch (cleanupErr) {
      logger.warn(
        `[BullMQ:Worker] Failed to remove temp file ${tempFilePath}: ${(cleanupErr as Error).message}`
      );
    }
  }
}

/**
 * BullMQ Worker instance for attachment uploads
 */
export const attachmentWorker = new Worker<AttachmentJobData>(
  ATTACHMENT_QUEUE_NAME,
  processAttachmentJob,
  {
    connection: bullmqConnection,
    concurrency: 5,
  }
);

attachmentWorker.on("completed", (job: Job<AttachmentJobData>) => {
  logger.info(`[BullMQ:Worker] Job ${job.id} completed successfully`);
});

attachmentWorker.on("failed", (job: Job<AttachmentJobData> | undefined, err: Error) => {
  logger.error(
    `[BullMQ:Worker] Job ${job?.id} failed with error: ${err.message}`
  );
});

attachmentWorker.on("error", (err: Error) => {
  logger.error(`[BullMQ:Worker] Worker error: ${err.message}`);
});

export default attachmentWorker;
