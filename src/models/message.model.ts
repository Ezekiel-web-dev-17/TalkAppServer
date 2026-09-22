import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISenderSnapshot {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface IReplySnapshot {
  messageId: string;
  senderId: string;
  senderName: string;
  contentSnippet: string;
  contentType: string;
}

export interface IMessageAttachment {
  url: string;
  type: "IMAGE" | "AUDIO" | "VIDEO" | "FILE";
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
  thumbnailUrl?: string;
}

export interface IMessageReaction {
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface IMessageDelivery {
  userId: string;
  deliveredAt: Date;
}

export interface IMessageRead {
  userId: string;
  readAt: Date;
}

export interface IMessageEncryption {
  isEncrypted: boolean;
  algorithm?: string;
  iv?: string;
  tag?: string;
}

export interface ILinkPreview {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  favIcon?: string;
}

export interface IMessage extends Document {
  id: string;
  conversationId: string;
  senderId: string;
  // Denormalized sender snapshot to eliminate relational user lookups during pagination
  sender: ISenderSnapshot;
  content: string;
  contentType: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE" | "SYSTEM";
  attachments: IMessageAttachment[];
  // Rich link preview metadata if message contains a URL
  linkPreview?: ILinkPreview | null;
  // Denormalized quote snapshot to render replies instantly without fetching parent message
  replyTo: IReplySnapshot | null;
  isReply: boolean;
  isEdited: boolean;
  deletedAt: Date | null;
  deliveredTo: IMessageDelivery[];
  readBy: IMessageRead[];
  reactions: IMessageReaction[];
  encryption?: IMessageEncryption;
  createdAt: Date;
  updatedAt: Date;
}

const senderSnapshotSchema = new Schema<ISenderSnapshot>(
  {
    id: { type: String, required: true },
    username: { type: String, required: true },
    name: { type: String, default: null },
    avatarUrl: { type: String, default: null },
  },
  { _id: false }
);

const replySnapshotSchema = new Schema<IReplySnapshot>(
  {
    messageId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    contentSnippet: { type: String, required: true, maxlength: 120 },
    contentType: { type: String, default: "TEXT" },
  },
  { _id: false }
);

const attachmentSchema = new Schema<IMessageAttachment>(
  {
    url: { type: String, required: true },
    type: {
      type: String,
      enum: ["IMAGE", "AUDIO", "VIDEO", "FILE"],
      required: true,
    },
    mimeType: { type: String },
    fileName: { type: String },
    sizeBytes: { type: Number },
    thumbnailUrl: { type: String },
  },
  { _id: false }
);

const messageReactionSchema = new Schema<IMessageReaction>(
  {
    userId: { type: String, required: true },
    emoji: { type: String, required: true, maxlength: 16 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const messageDeliverySchema = new Schema<IMessageDelivery>(
  {
    userId: { type: String, required: true },
    deliveredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageReadSchema = new Schema<IMessageRead>(
  {
    userId: { type: String, required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageEncryptionSchema = new Schema<IMessageEncryption>(
  {
    isEncrypted: { type: Boolean, default: false },
    algorithm: { type: String, default: "AES-256-GCM" },
    iv: { type: String },
    tag: { type: String },
  },
  { _id: false }
);

const linkPreviewSchema = new Schema<ILinkPreview>(
  {
    url: { type: String, required: true },
    title: { type: String },
    description: { type: String },
    imageUrl: { type: String },
    siteName: { type: String },
    favIcon: { type: String },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: senderSnapshotSchema,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      enum: ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE", "SYSTEM"],
      default: "TEXT",
      required: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    linkPreview: {
      type: linkPreviewSchema,
      default: null,
    },
    replyTo: {
      type: replySnapshotSchema,
      default: null,
    },
    isReply: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deliveredTo: [messageDeliverySchema],
    readBy: [messageReadSchema],
    reactions: [messageReactionSchema],
    encryption: {
      type: messageEncryptionSchema,
      default: () => ({ isEncrypted: false }),
    },
  },
  {
    timestamps: true,
    toObject: { transform: transformDocument },
    toJSON: { transform: transformDocument },
  }
);

// Compound index for optimal cursor-based pagination
messageSchema.index({ conversationId: 1, createdAt: -1 });

function transformDocument(_doc: unknown, ret: Record<string, unknown>) {
  ret.id = (ret._id as mongoose.Types.ObjectId)?.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
}

export const MessageReactionModel: Model<IMessageReaction> =
  mongoose.models.MessageReaction ||
  mongoose.model<IMessageReaction>("MessageReaction", messageReactionSchema);

export const MessageModel: Model<IMessage> =
  mongoose.models.Message ||
  mongoose.model<IMessage>("Message", messageSchema);

export default MessageModel;