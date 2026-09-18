import { Request, Response } from "express";
import { Webhook } from "svix";
import { CLERK_WEBHOOK_SECRET } from "../config/env.config.js";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";

// Types for Clerk webhook event payloads
interface ClerkUserData {
  id: string;
  email_addresses: { email_address: string; id: string }[];
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

interface ClerkWebhookEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  data: ClerkUserData | { id: string };
}

/**
 * POST /api/webhooks/clerk
 *
 * Receives and processes Clerk webhook events.
 * Svix signature verification ensures the request genuinely came from Clerk.
 *
 * IMPORTANT: This route must use express.raw() body parser, NOT express.json()
 * because svix needs the raw body bytes for signature verification.
 */
export const clerkWebhookHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!CLERK_WEBHOOK_SECRET) {
    logger.error("[WEBHOOK] CLERK_WEBHOOK_SECRET is not configured");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }

  // Extract svix headers for signature verification
  const svixId        = req.headers["svix-id"] as string;
  const svixTimestamp = req.headers["svix-timestamp"] as string;
  const svixSignature = req.headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: "Missing svix webhook headers" });
    return;
  }

  // Verify the webhook signature using svix
  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(CLERK_WEBHOOK_SECRET);
    event = wh.verify(req.body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as ClerkWebhookEvent;
  } catch (err) {
    logger.warn("[WEBHOOK] Invalid Clerk webhook signature");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info(`[WEBHOOK] Received Clerk event: ${event.type}`);

  try {
    switch (event.type) {
      case "user.created": {
        const data = event.data as ClerkUserData;
        const primaryEmail = data.email_addresses[0]?.email_address;

        if (!primaryEmail) {
          logger.warn("[WEBHOOK] user.created event missing email address");
          break;
        }

        // Generate a username from Clerk's username or fallback to email prefix
        const baseUsername = data.username
          ?? primaryEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");

        // Retry loop to handle username collisions via DB unique constraint
        let username = baseUsername;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await prisma.user.create({
              data: {
                clerkId:   data.id,
                email:     primaryEmail,
                username,
                name:      [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
                avatarUrl: data.image_url || null,
              },
            });
            break; // success
          } catch (err: any) {
            if (err.code === "P2002" && err.meta?.target?.includes("username")) {
              username = `${baseUsername}_${Date.now().toString(36)}`;
              continue; // retry with new username
            }
            throw err; // re-throw non-uniqueness errors
          }
        }

        logger.info("[WEBHOOK] Created DB profile for Clerk user successfully");
        break;
      }

      case "user.updated": {
        const data = event.data as ClerkUserData;
        const primaryEmail = data.email_addresses[0]?.email_address;

        // Sync email and avatar from Clerk (these are Clerk-managed)
        await prisma.user.updateMany({
          where: { clerkId: data.id },
          data: {
            ...(primaryEmail ? { email: primaryEmail } : {}),
            ...(data.image_url !== undefined ? { avatarUrl: data.image_url } : {}),
          },
        });

        logger.info(`[WEBHOOK] Updated DB profile for Clerk user`);
        break;
      }

      case "user.deleted": {
        const data = event.data as { id: string };

        // Soft-delete or hard-delete depending on your retention policy
        await prisma.user.deleteMany({
          where: { clerkId: data.id },
        });

        logger.info(`[WEBHOOK] Deleted DB profile for Clerk user: ...${data.id.slice(-6)}`);
        break;
      }

      default:
        logger.warn(`[WEBHOOK] Unhandled Clerk event type: ${event.type}`);
    }

    // Always respond 200 to Clerk so it doesn't retry
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error("[WEBHOOK] Error processing Clerk event:", err);
    res.status(500).json({ error: "Internal webhook processing error" });
  }
};