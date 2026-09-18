import { z } from "zod";

// ─────────────────────────────────────────────
// User search & lookup schemas
// ─────────────────────────────────────────────

/** Query params for searching users by username or display name */
export const UserSearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "Search query cannot be empty")
    .max(50, "Search query is too long")
    .trim(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Route param: any route that takes /:id as a UUID */
export const UUIDParamSchema = z.object({
  id: z.uuid("Invalid ID format"),
});

/** Route param: any route that takes /:userId */
export const UserIdParamSchema = z.object({
  userId: z.uuid("Invalid user ID format"),
});

// Inferred TypeScript types
export type UserSearchQuery = z.infer<typeof UserSearchQuerySchema>;
export type UUIDParam = z.infer<typeof UUIDParamSchema>;
