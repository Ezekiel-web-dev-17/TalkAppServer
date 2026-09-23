import { z } from "zod";

// ─────────────────────────────────────────────
// Message content schemas
// ─────────────────────────────────────────────

/** A single attachment input on a message */
export const AttachmentInputSchema = z.object({
  url: z.string().url("Attachment must have a valid URL"),
  type: z.enum(["IMAGE", "AUDIO", "VIDEO", "FILE"]),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
  thumbnailUrl: z.string().url().optional(),
});

/** Body for sending a new message into a conversation */
export const SendMessageSchema = z
  .object({
    content: z
      .string()
      .max(5000, "Message cannot exceed 5000 characters")
      .trim()
      .optional()
      .default(""),
    contentType: z
      .enum(["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE", "SYSTEM"])
      .optional(),
    type: z
      .enum(["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE", "SYSTEM"])
      .optional(),
    attachments: z.array(AttachmentInputSchema).optional().default([]),
    replyTo: z.string().optional(),
    replyToMessageId: z.string().optional(),
    isReply: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const resolvedType = data.contentType || data.type || "TEXT";
    // If text message, no need to enforce attachments, but content must not be empty
    if (resolvedType === "TEXT") {
      if (!data.content || data.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Message content is required for text messages",
          path: ["content"],
        });
      }
    } else {
      // Non-text media message: requires attachment(s) or content caption
      if (
        (!data.attachments || data.attachments.length === 0) &&
        (!data.content || data.content.trim().length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At least one attachment is required for ${resolvedType} messages`,
          path: ["attachments"],
        });
      }
    }
  });

/** Body for editing an existing message */
export const EditMessageSchema = z.object({
  content: z
    .string()
    .max(5000, "Message cannot exceed 5000 characters")
    .trim()
    .optional(),
});

/** Query params for paginating through a conversation's message history */
export const MessagePaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  skip: z.coerce.number().int().min(0).default(0),
});

/** Route param: /:messageId */
export const MessageIdParamSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
});

/** Body for toggling an emoji reaction on a message */
export const MessageReactionSchema = z.object({
  emoji: z
    .string()
    .min(1, "Emoji is required")
    .max(10, "Emoji value is too long"),
});

/** Options for deleting a message (for self or others) */
export const DeleteMessageSchema = z.object({
  type: z
    .enum([
      "SELF",
      "OTHERS",
      "EVERYONE",
      "self",
      "others",
      "everyone",
      "me",
      "ME",
    ])
    .optional()
    .default("SELF"),
});

// Inferred TypeScript types
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type EditMessageInput = z.infer<typeof EditMessageSchema>;
export type MessagePaginationQuery = z.infer<
  typeof MessagePaginationQuerySchema
>;
export type MessageReactionInput = z.infer<typeof MessageReactionSchema>;
export type DeleteMessageInput = z.infer<typeof DeleteMessageSchema>;
