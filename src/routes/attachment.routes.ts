import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { AttachmentPresignedUrlSchema } from "../schemas/attachment.schema.js";
import { getAttachmentPresignedUrl } from "../controllers/attachment.controller.js";

const router = Router();

// All attachment operations require an authenticated user
router.use(requireAuth);

/**
 * Generate a presigned S3 upload URL for an attachment
 * POST /api/v1/attachments/presigned-url
 */
router.post(
  "/presigned-url",
  validate(AttachmentPresignedUrlSchema),
  getAttachmentPresignedUrl
);

export default router;
