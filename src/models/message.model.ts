import mongoose, { Schema, Document, Model } from "mongoose";

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

export interface IMessage extends Document {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType: "TEXT" | "IMAGE" | "AUDIO" | "FILE" | "SYSTEM";
  replyToId: mongoose.Types.ObjectId | null;
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
    content: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      enum: ["TEXT", "IMAGE", "AUDIO", "FILE", "SYSTEM"],
      default: "TEXT",
      required: true,
    },
    replyToId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
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