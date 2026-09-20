import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserSettings extends Document {
  userId: string; // Foreign reference to PostgreSQL User.id
  privacy: {
    lastSeen: "EVERYONE" | "CONTACTS" | "NOBODY" | "EXCEPT";
    online: "EVERYONE" | "SAME";
    profilePicture: "EVERYONE" | "CONTACTS" | "NOBODY" | "EXCEPT";
    about: "EVERYONE" | "CONTACTS" | "NOBODY" | "EXCEPT";
    readReceipts: boolean;
    disappearingMessageTimer: number | null; // e.g. 86400 for 24h, null for off
    groupAdd: "EVERYONE" | "CONTACTS" | "NOBODY" | "EXCEPT";
    liveLocation: boolean;
    callPrivacy: boolean;
    cameraEffect: boolean;
    blockedUserIds: string[];
    exceptContactForLastSeen: string[];
    exceptContactForProfilePicture: string[];
    exceptContactForAbout: string[];
    exceptContactForStatus: string[];
    allowOnlyForStatus: string[];
    advanced: {
      blockUnknownMessages: boolean;
      protectIPAddressInCalls: boolean;
      disableLinkPreviews: boolean;
      strictAccountSettings: boolean;
    };
  };
  chats: {
    theme: "SYSTEM" | "LIGHT" | "DARK";
    fontSize: "SMALL" | "MEDIUM" | "LARGE";
    enterIsSend: boolean;
    mediaVisibility: boolean;
    archiveChats: boolean;
    wallpaper?: string;
    chatBubbleColor?: string;
    backup: {
      autoBackup: "DAILY" | "WEEKLY" | "MONTHLY" | "OFF";
      backupOverCellular: boolean;
      includeVideo: boolean;
      encryptedBackup: boolean;
      lastBackupAt?: Date;
      lastBackupSizeBytes?: number;
    };
  };
  notifications: {
    tones: boolean;
    reminders: boolean;
    messages: {
      sound: string;
      vibrate: "OFF" | "DEFAULT" | "SHORT" | "LONG";
      preview: boolean;
      reactions: boolean;
    };
    groups: {
      sound: string;
      vibrate: "OFF" | "DEFAULT" | "SHORT" | "LONG";
      preview: boolean;
      reactions: boolean;
    };
    calls: {
      ringtone: string;
      vibrate: "OFF" | "DEFAULT" | "SHORT" | "LONG";
    };
  };
  security: {
    twoFactorEnabled: boolean;
    appLock: {
      enabled: boolean;
      timeoutSeconds: number; // e.g. 0 (immediately), 60 (1 min), 1800 (30 mins)
      biometricUnlock: boolean;
      showContentInNotifications: boolean;
    };
  };
  accessibility: {
    highContrast: boolean;
    animations: {
      messages: boolean;
      emojis: boolean;
      stickers: boolean;
      gifs: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    privacy: {
      lastSeen: {
        type: String,
        enum: ["EVERYONE", "CONTACTS", "NOBODY", "EXCEPT"],
        default: "NOBODY",
      },
      online: { type: String, enum: ["EVERYONE", "SAME"], default: "SAME" },
      profilePicture: {
        type: String,
        enum: ["EVERYONE", "CONTACTS", "NOBODY", "EXCEPT"],
        default: "EVERYONE",
      },
      about: {
        type: String,
        enum: ["EVERYONE", "CONTACTS", "NOBODY", "EXCEPT"],
        default: "EVERYONE",
      },
      readReceipts: { type: Boolean, default: true },
      disappearingMessageTimer: { type: Number, default: null },
      groupAdd: {
        type: String,
        enum: ["EVERYONE", "CONTACTS", "NOBODY", "EXCEPT"],
        default: "EVERYONE",
      },
      liveLocation: { type: Boolean, default: false },
      callPrivacy: { type: Boolean, default: true },
      cameraEffect: { type: Boolean, default: false },
      blockedUserIds: { type: [String], default: [] },
      exceptContactForLastSeen: { type: [String], default: [] },
      exceptContactForProfilePicture: { type: [String], default: [] },
      exceptContactForAbout: { type: [String], default: [] },
      exceptContactForStatus: { type: [String], default: [] },
      allowOnlyForStatus: { type: [String], default: [] },
      advanced: {
        blockUnknownMessages: { type: Boolean, default: false },
        protectIPAddressInCalls: { type: Boolean, default: false },
        disableLinkPreviews: { type: Boolean, default: false },
        strictAccountSettings: { type: Boolean, default: false },
      },
    },
    chats: {
      theme: {
        type: String,
        enum: ["SYSTEM", "LIGHT", "DARK"],
        default: "SYSTEM",
      },
      fontSize: {
        type: String,
        enum: ["SMALL", "MEDIUM", "LARGE"],
        default: "MEDIUM",
      },
      enterIsSend: { type: Boolean, default: false },
      mediaVisibility: { type: Boolean, default: true },
      archiveChats: { type: Boolean, default: true },
      wallpaper: { type: String, default: null },
      chatBubbleColor: { type: String, default: null },
      backup: {
        autoBackup: {
          type: String,
          enum: ["DAILY", "WEEKLY", "MONTHLY", "OFF"],
          default: "MONTHLY",
        },
        backupOverCellular: { type: Boolean, default: false },
        includeVideo: { type: Boolean, default: false },
        encryptedBackup: { type: Boolean, default: false },
        lastBackupAt: { type: Date },
        lastBackupSizeBytes: { type: Number, default: 0 },
      },
    },
    notifications: {
      tones: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
      messages: {
        sound: { type: String, default: "default" },
        vibrate: {
          type: String,
          enum: ["OFF", "DEFAULT", "SHORT", "LONG"],
          default: "DEFAULT",
        },
        preview: { type: Boolean, default: true },
        reactions: { type: Boolean, default: true },
      },
      groups: {
        sound: { type: String, default: "default" },
        vibrate: {
          type: String,
          enum: ["OFF", "DEFAULT", "SHORT", "LONG"],
          default: "DEFAULT",
        },
        preview: { type: Boolean, default: true },
        reactions: { type: Boolean, default: true },
      },
      calls: {
        ringtone: { type: String, default: "default" },
        vibrate: {
          type: String,
          enum: ["OFF", "DEFAULT", "SHORT", "LONG"],
          default: "DEFAULT",
        },
      },
    },
    security: {
      twoFactorEnabled: { type: Boolean, default: false },
      appLock: {
        enabled: { type: Boolean, default: false },
        timeoutSeconds: { type: Number, default: 60 },
        biometricUnlock: { type: Boolean, default: false },
        showContentInNotifications: { type: Boolean, default: true },
      },
    },
    accessibility: {
      highContrast: { type: Boolean, default: false },
      animations: {
        messages: { type: Boolean, default: true },
        emojis: { type: Boolean, default: true },
        stickers: { type: Boolean, default: true },
        gifs: { type: Boolean, default: true },
      },
    },
  },
  {
    timestamps: true,
  },
);

export const UserSettingsModel: Model<IUserSettings> =
  mongoose.models.UserSettings ||
  mongoose.model<IUserSettings>("UserSettings", userSettingsSchema);

export default UserSettingsModel;
