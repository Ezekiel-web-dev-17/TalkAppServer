import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  SendMessageSchema,
  EditMessageSchema,
  MessageReactionSchema,
  MessagePaginationQuerySchema,
} from "../schemas/message.schema.js";
import {
  sendMessage,
  getConversationMessages,
  editMessage,
  deleteMessage,
  toggleReaction,
  markConversationAsRead,
} from "../controllers/message.controller.js";

const router = Router();

// All message routes require an authenticated user
router.use(requireAuth);

// ─────────────────────────────────────────────
// Specific Message Operations: /api/v1/messages
// ─────────────────────────────────────────────

/** Edit an existing message */
router.patch("/:messageId", validate(EditMessageSchema), editMessage);

/** Soft delete an existing message */
router.delete("/:messageId", deleteMessage);

/** Add or toggle an emoji reaction */
router.post("/:messageId/reactions", validate(MessageReactionSchema), toggleReaction);

// ─────────────────────────────────────────────
// Conversation-Scoped Messages: /api/v1/conversations/:conversationId
// ─────────────────────────────────────────────

export const conversationMessagesRouter = Router({ mergeParams: true });
conversationMessagesRouter.use(requireAuth);

/** Send a message into a conversation */
conversationMessagesRouter.post(
  "/",
  validate(SendMessageSchema),
  sendMessage
);

/** Get messages with cursor pagination */
conversationMessagesRouter.get(
  "/",
  validate(MessagePaginationQuerySchema, "query"),
  getConversationMessages
);

/** Mark conversation messages as read */
conversationMessagesRouter.post(
  "/read",
  markConversationAsRead
);

export default router;
