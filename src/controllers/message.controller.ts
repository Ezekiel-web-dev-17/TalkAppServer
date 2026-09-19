import { Request, Response, NextFunction } from "express";

/**
 * POST /api/v1/conversations/:conversationId/messages
 * Send a new message to a conversation.
 */
export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {};

/**
 * GET /api/v1/conversations/:conversationId/messages
 * Retrieve messages for a conversation with cursor-based pagination.
 */
export const getConversationMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {};

/**
 * PATCH /api/v1/messages/:messageId
 * Edit an existing message (author only).
 */
export const editMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {};

/**
 * DELETE /api/v1/messages/:messageId
 * Soft-delete a message (author or conversation admin/user).
 */
export const deleteMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {};

/**
 * POST /api/v1/messages/:messageId/reactions
 * Add or toggle an emoji reaction on a message.
 */
export const toggleReaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {};

/**
 * POST /api/v1/conversations/:conversationId/read
 * Mark all messages in a conversation as read by the current user.
 */
export const markConversationAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {};
