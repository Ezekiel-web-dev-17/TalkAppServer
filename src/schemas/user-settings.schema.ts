import { z } from "zod";

// ─────────────────────────────────────────────
// XSS-Safe Input Validation Primitives
// ─────────────────────────────────────────────

/** Validates PostgreSQL UUID identifiers (prevents injection of arbitrary strings into ID arrays) */
const SafeId = z.string().uuid("Invalid user ID format");

/** Validates safe sound/ringtone identifiers (prevents script/HTML injection into audio cues) */
const SafeSoundIdentifier = z
  .string()
  .trim()
  .max(50, "Sound name cannot exceed 50 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Sound name can only contain letters, numbers, hyphens, and underscores",
  );

/** Validates hex color codes (blocks CSS injection and HTML breakout characters) */
const HexColor = z
  .string()
  .trim()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    "Must be a valid hex color code (e.g. #FFF, #007AFF, or #007AFF80)",
  );

/** Validates external wallpaper URLs; strictly enforces HTTP/HTTPS to block javascript: and data: XSS payloads */
const SafeWallpaperUrl = z
  .string()
  .url("Wallpaper must be a valid URL")
  .refine(
    (url) => /^https?:\/\//i.test(url),
    "Only http:// and https:// URL protocols are permitted",
  );

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

const PrivacyEnum = z.enum(["EVERYONE", "CONTACTS", "NOBODY", "EXCEPT"]);
const OnlineEnum = z.enum(["EVERYONE", "SAME"]);
const VibrateEnum = z.enum(["OFF", "DEFAULT", "SHORT", "LONG"]);
const ThemeEnum = z.enum(["SYSTEM", "LIGHT", "DARK"]);
const FontSizeEnum = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const AutoBackupEnum = z.enum(["DAILY", "WEEKLY", "MONTHLY", "OFF"]);

// ─────────────────────────────────────────────
// User Settings Update Validation Schema
// ─────────────────────────────────────────────

export const UpdateUserSettingsSchema = z
  .object({
    privacy: z
      .object({
        lastSeen: PrivacyEnum.optional(),
        online: OnlineEnum.optional(),
        profilePicture: PrivacyEnum.optional(),
        about: PrivacyEnum.optional(),
        readReceipts: z.boolean().optional(),
        disappearingMessageTimer: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .optional(),
        groupAdd: PrivacyEnum.optional(),
        liveLocation: z.boolean().optional(),
        callPrivacy: z.boolean().optional(),
        cameraEffect: z.boolean().optional(),
        blockedUserIds: z.array(SafeId).optional(),
        exceptContactForLastSeen: z.array(SafeId).optional(),
        exceptContactForProfilePicture: z.array(SafeId).optional(),
        exceptContactForAbout: z.array(SafeId).optional(),
        exceptContactForStatus: z.array(SafeId).optional(),
        allowOnlyForStatus: z.array(SafeId).optional(),
        advanced: z
          .object({
            blockUnknownMessages: z.boolean().optional(),
            protectIPAddressInCalls: z.boolean().optional(),
            disableLinkPreviews: z.boolean().optional(),
            strictAccountSettings: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    chats: z
      .object({
        theme: ThemeEnum.optional(),
        fontSize: FontSizeEnum.optional(),
        enterIsSend: z.boolean().optional(),
        mediaVisibility: z.boolean().optional(),
        archiveChats: z.boolean().optional(),
        wallpaper: SafeWallpaperUrl.nullable().optional(),
        chatBubbleColor: HexColor.nullable().optional(),
        backup: z
          .object({
            autoBackup: AutoBackupEnum.optional(),
            backupOverCellular: z.boolean().optional(),
            includeVideo: z.boolean().optional(),
            encryptedBackup: z.boolean().optional(),
            lastBackupAt: z.coerce.date().optional(),
            lastBackupSizeBytes: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    notifications: z
      .object({
        tones: z.boolean().optional(),
        reminders: z.boolean().optional(),
        messages: z
          .object({
            sound: SafeSoundIdentifier.optional(),
            vibrate: VibrateEnum.optional(),
            preview: z.boolean().optional(),
            reactions: z.boolean().optional(),
          })
          .strict()
          .optional(),
        groups: z
          .object({
            sound: SafeSoundIdentifier.optional(),
            vibrate: VibrateEnum.optional(),
            preview: z.boolean().optional(),
            reactions: z.boolean().optional(),
          })
          .strict()
          .optional(),
        calls: z
          .object({
            ringtone: SafeSoundIdentifier.optional(),
            vibrate: VibrateEnum.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    security: z
      .object({
        twoFactorEnabled: z.boolean().optional(),
        appLock: z
          .object({
            enabled: z.boolean().optional(),
            timeoutSeconds: z.number().int().nonnegative().optional(),
            biometricUnlock: z.boolean().optional(),
            showContentInNotifications: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    accessibility: z
      .object({
        highContrast: z.boolean().optional(),
        animations: z
          .object({
            messages: z.boolean().optional(),
            emojis: z.boolean().optional(),
            stickers: z.boolean().optional(),
            gifs: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one settings section must be provided to update",
  });

export type UpdateUserSettingsInput = z.infer<typeof UpdateUserSettingsSchema>;
