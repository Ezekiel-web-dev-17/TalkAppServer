import { z } from "zod";

// ─────────────────────────────────────────────
// Registration & profile input schemas
// ─────────────────────────────────────────────

/**
 * Used when Clerk fires the user.created webhook and we need to
 * derive a username and display name to store in our DB.
 * Also used directly if you ever need a manual registration endpoint.
 */
export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username cannot exceed 30 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    )
    .trim()
    .toLowerCase(),
  email: z
    .string()
    .email("Please provide a valid email address")
    .trim()
    .toLowerCase(),
  name: z.string().min(1).max(80).trim().optional(),
});

/**
 * Allows a user to update the profile fields owned by this application
 * (bio, display name, avatar, username). Email changes are handled by
 * Clerk and synced via webhook — never accepted directly here.
 */
export const UpdateProfileSchema = z
  .object({
    name: z.string().min(1, "Display name cannot be empty").max(80).trim().optional(),
    bio: z
      .string()
      .max(300, "Bio cannot exceed 300 characters")
      .trim()
      .optional(),
    avatarUrl: z.string().url("Avatar must be a valid URL").nullable().optional(),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username cannot exceed 30 characters")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores"
      )
      .trim()
      .toLowerCase()
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: "At least one field must be provided to update" }
  );

// Inferred TypeScript types — no need to write separate interfaces
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
