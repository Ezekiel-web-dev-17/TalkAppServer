import { Queue, QueueOptions } from "bullmq";
import { bullmqConnection } from "../lib/bullmq.js";
import logger from "../lib/logger.js";

export const ATTACHMENT_QUEUE_NAME = "attachment-upload-queue";

export interface AttachmentJobData {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  messageId: string;
  conversationId: string;
  userId: string;
  action: "SEND" | "UPDATE";
  replaceExisting?: boolean;
}

const queueOptions: QueueOptions = {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // 1 hour
      count: 500,
    },
    removeOnFail: {
      age: 24 * 3600, // 24 hours
      count: 1000,
    },
  },
};

export const attachmentQueue = new Queue<AttachmentJobData>(
  ATTACHMENT_QUEUE_NAME,
  queueOptions
);

attachmentQueue.on("error", (err: Error) => {
  logger.error(`[BullMQ:Queue] Attachment queue error: ${err.message}`);
});

/**
 * Add an attachment upload job to BullMQ
 */
export async function addAttachmentJob(data: AttachmentJobData) {
  const job = await attachmentQueue.add("upload-attachment", data);
  logger.info(
    `[BullMQ:Queue] Enqueued attachment job ${job.id} for message ${data.messageId} (file: ${data.originalName})`
  );
  return job;
}

export default attachmentQueue;
