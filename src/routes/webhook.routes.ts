import { Router } from "express";
import express from "express";
import { clerkWebhookHandler } from "../controllers/webhook.controller.js";

const router = Router();

/**
 * CRITICAL: Use express.raw() for the webhook route.
 * The body must be the raw Buffer bytes for svix signature verification.
 * If you use express.json() here, verification will FAIL.
 */
router.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookHandler
);

export default router;