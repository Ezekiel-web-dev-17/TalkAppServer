import { z } from "zod";

// ─────────────────────────────────────────────
// Conversation creation & management schemas
// ─────────────────────────────────────────────

/** Start or retrieve a 1-on-1 Direct Message conversation */
export const CreateDirectConversationSchema = z.object({
  targetUserId: z.string().uuid("Invalid user ID"),
});

/**
 * Create a new group chat.
 * The creator is automatically added as OWNER, so memberIds
 * should only contain the OTHER participants.
 */
export const CreateGroupConversationSchema = z.object({
  name: z
    .string()
    .min(1, "Group name is required")
    .max(100, "Group name cannot exceed 100 characters")
    .trim(),
  memberIds: z
    .array(z.string().uuid("Each member ID must be a valid UUID"))
    .min(1, "A group must have at least one other member")
    .max(99, "A group cannot have more than 99 additional members"),
  avatarUrl: z.string().url("Avatar must be a valid URL").optional(),
});

/** Update group metadata (admin-only fields) */
export const UpdateGroupSchema = z
  .object({
    name: z
      .string()
      .min(1, "Group name cannot be empty")
      .max(100)
      .trim()
      .optional(),
    avatarUrl: z.string().url("Avatar must be a valid URL").nullable().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: "At least one field must be provided to update" }
  );

/** Body for adding members to an existing group */
export const AddGroupMembersSchema = z.object({
  memberIds: z
    .array(z.string().uuid("Each member ID must be a valid UUID"))
    .min(1, "At least one member ID is required")
    .max(50, "Cannot add more than 50 members at once"),
});

/** Route params: /:conversationId */
export const ConversationIdParamSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID format"),
});

/** Route params: /:conversationId/members/:userId */
export const ConversationMemberParamSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID format"),
  userId: z.string().uuid("Invalid user ID format"),
});

// Inferred TypeScript types — creation & management
export type CreateDirectConversationInput = z.infer<typeof CreateDirectConversationSchema>;
export type CreateGroupConversationInput = z.infer<typeof CreateGroupConversationSchema>;
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
export type AddGroupMembersInput = z.infer<typeof AddGroupMembersSchema>;

// ─────────────────────────────────────────────
// Entity-level schemas (match Prisma models)
// ─────────────────────────────────────────────

/** Enum values mirroring Prisma's MediaFormat */
export const MediaFormatEnum = z.enum(["DOC", "LINK", "MEDIA"]);

/** Enum values mirroring Prisma's ChangeType */
export const ChangeTypeEnum = z.enum(["USERNAME", "LEFT", "REMOVED"]);

/** Enum values mirroring Prisma's Chat type */
export const ChatTypeEnum = z.enum(["DM", "GROUP", "YOU"]);

/** Regex patterns for media validation */
export const MEDIA_VALIDATION_REGEX = {
  link: /^(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+)(\/\S*)?$/,
  media: /\.(jpg|jpeg|png|gif|mp4|mov|mp3)$/i,
  document: /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i,
};

/** A single media attachment on a conversation with content format validation */
export const MediaSchema = z
  .object({
    id: z.string().uuid("Media ID must be a valid UUID").optional(),
    mediaType: z.array(MediaFormatEnum).min(1, "At least one media format is required"),
    content: z.string().min(1, "Media content cannot be empty"),
    messageId: z.string().uuid("Message ID must be a valid UUID"),
  })
  .superRefine((data, ctx) => {
    const cleanContent = data.content.split(/[?#]/)[0];

    for (const type of data.mediaType) {
      if (type === "LINK" && !MEDIA_VALIDATION_REGEX.link.test(cleanContent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Content must be a valid URL link when format is LINK",
          path: ["content"],
        });
      }
      if (type === "MEDIA" && !MEDIA_VALIDATION_REGEX.media.test(cleanContent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Content must end with a valid media extension (.jpg, .jpeg, .png, .gif, .mp4, .mov, .mp3)",
          path: ["content"],
        });
      }
      if (type === "DOC" && !MEDIA_VALIDATION_REGEX.document.test(cleanContent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Content must end with a valid document extension (.pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .csv)",
          path: ["content"],
        });
      }
    }
  });

/** Validates conversation media attachments using Zod (replaces validateConversation in validators.helper.ts) */
export const validateConversationMedia = (input: unknown) => {
  return z.array(MediaSchema).safeParse(input);
};

/** A member-change audit entry */
export const MemberChangeSchema = z.object({
  changeType: ChangeTypeEnum,
  change: z
    .string()
    .min(6, "Change must have at least 6 characters")
    .max(30, "Change cannot exceed 30 characters"),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

/** Enum values mirroring Prisma's MemberRole */
export const MemberRoleEnum = z.enum(["USER", "ADMIN", "MEMBER"]);

/** A conversation membership record linking a user to a conversation */
export const ConversationMemberSchema = z.object({
  id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  userId: z.string().uuid("User ID must be a valid UUID"),
  role: MemberRoleEnum.default("MEMBER"),
  joinedAt: z.coerce.date().optional(),
  lastReadAt: z.coerce.date().nullable().optional(),
});

/** Full Conversation entity — used for response validation and internal checks */
export const ConversationSchema = z.object({
  conversationId: z.string().uuid("Conversation ID must be a valid UUID"),
  name: z.string().max(100, "Name cannot exceed 100 characters").nullable().optional(),
  type: ChatTypeEnum.default("DM"),
  image: z.string().url("Image must be a valid URL").nullable().optional(),
  description: z
    .string()
    .max(200, "Description cannot exceed 200 characters")
    .nullable()
    .optional(),
  dmKey: z.string().nullable().optional(),
  advancedPrivacy: z.boolean().default(false),
  lastActivityAt: z.coerce.date().optional(),
  lastMessagePreview: z.string().nullable().optional(),
  members: z.array(ConversationMemberSchema).optional().default([]),
  changes: z.array(MemberChangeSchema).optional().default([]),
  allMedia: z.array(MediaSchema).optional().default([]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Inferred TypeScript types — entities
export type MediaInput = z.infer<typeof MediaSchema>;
export type MemberChangeInput = z.infer<typeof MemberChangeSchema>;
export type ConversationMemberInput = z.infer<typeof ConversationMemberSchema>;
export type ConversationInput = z.infer<typeof ConversationSchema>;

