import { z } from "zod";

// ─────────────────────────────────────────────
// Message content schemas
// ─────────────────────────────────────────────

/** Body for sending a new message into a conversation */
export const SendMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message cannot exceed 5000 characters")
    .trim(),
  type: z.enum(["TEXT", "IMAGE", "AUDIO", "FILE"]).default("TEXT"),
  replyToMessageId: z.string().uuid("Invalid message ID").optional(),
});

/** Body for editing an existing message */
export const EditMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message cannot exceed 5000 characters")
    .trim(),
});

/** Query params for paginating through a conversation's message history */
export const MessagePaginationQuerySchema = z.object({
  /** UUID of the message to fetch messages *before* (cursor-based pagination) */
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Route param: /:messageId */
export const MessageIdParamSchema = z.object({
  messageId: z.string().uuid("Invalid message ID format"),
});

/** Body for toggling an emoji reaction on a message */
export const MessageReactionSchema = z.object({
  emoji: z
    .string()
    .min(1, "Emoji is required")
    .max(10, "Emoji value is too long"),
});

// Inferred TypeScript types
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type EditMessageInput = z.infer<typeof EditMessageSchema>;
export type MessagePaginationQuery = z.infer<typeof MessagePaginationQuerySchema>;
export type MessageReactionInput = z.infer<typeof MessageReactionSchema>;
