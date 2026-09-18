/**
 * Central export barrel for all Zod schemas.
 *
 * Import schemas from here in your routes and controllers:
 *   import { validate } from "../middlewares/validate.middleware.js";
 *   import { SendMessageSchema } from "../schemas/index.js";
 */
export * from "./auth.schema.js";
export * from "./user.schema.js";
export * from "./message.schema.js";
export * from "./conversation.schema.js";
