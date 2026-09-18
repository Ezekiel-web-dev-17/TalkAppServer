import mongoose from "mongoose"

let messageSchema = new mongoose.Schema({
    conversation: {
        ref: "Conversation",
        type: [mongoose.Schema.Types.ObjectId]
    },

    content : {
        type: String,
        min: 1,
        required: true
    },

    contentType: {
        type: String,
        enum: [
            "TEXT",
            "FILE",
            "AUDIO",
            "STATUS",
        ],
        required: true
    },

    isReply: {
        type: Boolean,
        default: false
    },

    senderId: {
        ref: "User",
        type: [mongoose.Schema.Types.ObjectId],
        required: true
    },

    readAt: {
      type: Date,
      required: true,
      default: new Date().toLocaleTimeString(["WAT"], {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "numeric",
      hour12: true,
    })},

    deliveredAt: {
        type: Date,
        required: true,
        default: new Date().toLocaleTimeString(["WAT"], {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "numeric",
            hour12: true,
        })
    },
    isRead: {
        type: Boolean,
        default: false
    },
    isDelivered: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toObject: {transform: transformDocument},
    toJSON: {transform: transformDocument}
})

function transformDocument(doc: any, ret: any) {
    ret.id = ret._id.toString();

    delete ret._id;
    delete ret.__v;

    return ret
}

export const Events = mongoose.model("Messages", messageSchema);