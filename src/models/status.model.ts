import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStatusView {
  userId: string;
  viewedAt: Date;
}

export interface IStatus extends Document {
  id: string;
  userId: string; // Foreign reference to PostgreSQL User.id
  type: "IMAGE" | "VIDEO" | "TEXT" | "AUDIO";
  mediaUrl?: string;
  caption?: string;
  backgroundColor?: string;
  views: IStatusView[];
  expiresAt: Date;
  createdAt: Date;
}

const statusViewSchema = new Schema<IStatusView>(
  {
    userId: { type: String, required: true },
    viewedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const statusSchema = new Schema<IStatus>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["IMAGE", "VIDEO", "TEXT", "AUDIO"],
      default: "TEXT",
      required: true,
    },
    mediaUrl: { type: String },
    caption: { type: String, maxlength: 500 },
    backgroundColor: { type: String },
    views: {
      type: [statusViewSchema],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
      // Automatically removes document from MongoDB once expiresAt time is reached
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
    toObject: { transform: transformDocument },
    toJSON: { transform: transformDocument },
  },
);

function transformDocument(_doc: unknown, ret: Record<string, unknown>) {
  ret.id = (ret._id as mongoose.Types.ObjectId)?.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
}

export const StatusModel: Model<IStatus> =
  mongoose.models.Status || mongoose.model<IStatus>("Status", statusSchema);

export default StatusModel;
