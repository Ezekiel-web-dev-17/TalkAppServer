import { Request, Response, NextFunction } from "express";
import type { UploadedFile } from "express-fileupload";
import prisma from "../lib/prisma.js";
import { ApiError } from "../middlewares/error.middleware.js";
import MessageModel, { IReplySnapshot } from "../models/message.model.js";
import { emitNewMessage, emitMessageEdited } from "../lib/socket.js";
import {
  extractUrls,
  fetchUrlPreview,
  ILinkPreview,
} from "../helpers/urlPreview.helper.js";
import { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from "../lib/s3.js";
import { addAttachmentJob } from "../queues/attachment.queue.js";

/**
 * Safely extract all uploaded files from req.files
 */
function extractUploadedFiles(files: unknown): UploadedFile[] {
  if (!files || typeof files !== "object") return [];
  const fileList: UploadedFile[] = [];
  for (const key of Object.keys(files as Record<string, unknown>)) {
    const item = (files as Record<string, unknown>)[key];
    if (Array.isArray(item)) {
      fileList.push(...(item as UploadedFile[]));
    } else if (item && typeof item === "object" && "tempFilePath" in item) {
      fileList.push(item as UploadedFile);
    }
  }
  return fileList;
}

/**
 * POST /api/v1/conversations/:conversationId/messages
 * Send a new message to a conversation.
 */
export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const conversationId = req.params.conversationId as string;
    const { content, contentType, type, replyTo, replyToMessageId, isReply } =
      req.body;
    const userId = req.auth.dbUser.id;

    if (!userId) {
      throw ApiError.unauthorized("User not found");
    }

    if (!conversationId) {
      throw ApiError.badRequest("Conversation ID is required");
    }

    const uploadedFiles = extractUploadedFiles(req.files);

    // Validate uploaded files against allow-lists and size restrictions
    for (const file of uploadedFiles) {
      const normalizedMime = file.mimetype.toLowerCase().trim();
      if (!ALLOWED_MIME_TYPES[normalizedMime]) {
        throw ApiError.badRequest(
          `Unsupported file type '${file.mimetype}' for file '${file.name}'.`
        );
      }
      if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw ApiError.badRequest(
          `File '${file.name}' exceeds the maximum allowed size of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`
        );
      }
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";

    // If no text and no files, message is empty
    if (!normalizedContent && uploadedFiles.length === 0) {
      throw ApiError.badRequest(
        "Message cannot be empty. Please provide text content or a file attachment."
      );
    }

    // Determine normalized contentType
    let resolvedType = contentType || type;
    if (!resolvedType) {
      if (uploadedFiles.length > 0) {
        const firstMime = uploadedFiles[0].mimetype.toLowerCase().trim();
        resolvedType = ALLOWED_MIME_TYPES[firstMime] || "FILE";
      } else {
        resolvedType = "TEXT";
      }
    }

    // Verify conversation existence and user membership
    const chat = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!chat) {
      throw ApiError.forbidden(
        "You must be an active member of this conversation to send messages",
      );
    }

    // If message contains a URL, safely extract preview image and metadata
    let linkPreview: ILinkPreview | null = null;
    if (normalizedContent) {
      const url = extractUrls(normalizedContent);
      if (url) {
        // Fetch preview for the first valid HTTPS URL
        linkPreview = await fetchUrlPreview(url);
      }
    }

    // Handle reply snapshot if message is replying to an existing message
    const replyTargetId = replyTo || replyToMessageId;
    let replySnapshot: IReplySnapshot | null = null;
    let repliedMessage: any = null;

    if (replyTargetId) {
      repliedMessage = await MessageModel.findById(replyTargetId).select(
        "content contentType senderId sender createdAt",
      );

      if (!repliedMessage) {
        throw ApiError.notFound("Replied message not found");
      }

      replySnapshot = {
        messageId: repliedMessage.id || repliedMessage._id.toString(),
        senderId: repliedMessage.senderId,
        senderName: repliedMessage.sender?.username || "Unknown",
        contentSnippet: (repliedMessage.content || "").substring(0, 120).trim(),
        contentType: repliedMessage.contentType || "TEXT",
      };
    }

    // Create message document in MongoDB
    const message = await MessageModel.create({
      conversationId,
      senderId: userId,
      sender: {
        id: userId,
        username: req.auth.dbUser.username,
        name: req.auth.dbUser.name || null,
        avatarUrl: req.auth.dbUser.avatarUrl || null,
      },
      content: normalizedContent,
      contentType: resolvedType,
      attachments: [],
      linkPreview,
      replyTo: replySnapshot,
      isReply: Boolean(isReply || replySnapshot),
    });

    if (!message) {
      throw new ApiError(500, "Failed to send message");
    }

    // Offload attachment file uploads to BullMQ worker asynchronously
    for (const file of uploadedFiles) {
      await addAttachmentJob({
        tempFilePath: file.tempFilePath,
        originalName: file.name,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        messageId: message.id,
        conversationId,
        userId,
        action: "SEND",
      });
    }

    // Update conversation inbox summary and unread counts in PostgreSQL
    await prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          lastMessage: {
            id: message.id,
            senderId: userId,
            senderName: req.auth.dbUser.username,
            text:
              message.content ||
              (message.contentType !== "TEXT"
                ? message.contentType
                : "ATTACHMENT"),
            contentType: message.contentType,
            createdAt: message.createdAt,
          },
          lastActivityAt: new Date(),
        },
      });

      await tx.conversationMember.updateMany({
        where: {
          conversationId,
          userId: {
            not: userId,
          },
        },
        data: {
          unreadCount: {
            increment: 1,
          },
        },
      });
    });

    const messageJson = message.toJSON();
    const broadcastMsg: any = {
      ...messageJson,
      ...(repliedMessage ? { repliedMessage } : {}),
    };

    emitNewMessage(conversationId, broadcastMsg);

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/conversations/:conversationId/messages
 * Retrieve messages for a conversation with cursor-based pagination.
 */
export const getConversationMessages = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {};

/**
 * PATCH /api/v1/messages/:messageId
 * Edit an existing message (author only).
 */
export const editMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { content, replaceAttachments } = req.body;
    const userId = req.auth.dbUser.id;

    const message = await MessageModel.findById(messageId);
    if (!message) {
      throw ApiError.notFound("Message not found");
    }

    if (message.senderId !== userId) {
      throw ApiError.forbidden("You are not authorized to edit this message");
    }

    const uploadedFiles = extractUploadedFiles(req.files);

    // Validate uploaded files
    for (const file of uploadedFiles) {
      const normalizedMime = file.mimetype.toLowerCase().trim();
      if (!ALLOWED_MIME_TYPES[normalizedMime]) {
        throw ApiError.badRequest(
          `Unsupported file type '${file.mimetype}' for file '${file.name}'.`
        );
      }
      if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw ApiError.badRequest(
          `File '${file.name}' exceeds the maximum allowed size of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`
        );
      }
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";

    if (!normalizedContent && uploadedFiles.length === 0) {
      throw ApiError.badRequest(
        "Please provide updated content or attachment files to edit this message."
      );
    }

    // Re-extract preview if URL changed or was added
    let linkPreview: ILinkPreview | null = message.linkPreview || null;
    if (normalizedContent) {
      const url = extractUrls(normalizedContent);
      if (url) {
        if (!linkPreview || linkPreview.url !== url) {
          linkPreview = await fetchUrlPreview(url);
        }
      } else {
        linkPreview = null;
      }
      message.content = normalizedContent;
    }

    message.isEdited = true;
    message.linkPreview = linkPreview;

    if (replaceAttachments && uploadedFiles.length > 0) {
      message.attachments = [];
    }

    await message.save();

    // Offload new file attachments to BullMQ worker asynchronously
    for (const file of uploadedFiles) {
      await addAttachmentJob({
        tempFilePath: file.tempFilePath,
        originalName: file.name,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        messageId: message.id,
        conversationId: message.conversationId,
        userId,
        action: "UPDATE",
        replaceExisting: Boolean(replaceAttachments),
      });
    }

    emitMessageEdited(message.conversationId, message.toJSON());

    res.status(200).json({
      success: true,
      message: "Message edited successfully",
      data: message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/messages/:messageId
 * Soft-delete a message (author or conversation admin/user).
 */
export const deleteMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {};

/**
 * POST /api/v1/messages/:messageId/reactions
 * Add or toggle an emoji reaction on a message.
 */
export const toggleReaction = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {};

/**
 * POST /api/v1/conversations/:conversationId/read
 * Mark all messages in a conversation as read by the current user.
 */
export const markConversationAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {};
