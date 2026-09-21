import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { isUserOnline } from "../lib/socket.js";
import UserSettingsModel from "../models/user-settings.model.js";

/** GET /api/v1/users/me — Return current user's profile */
export const getMyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { clerkUserId } = req.auth; // set by requireAuth middleware

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return next(new ApiError(404, "User profile not found"));
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/** POST /api/v1/users/heartbeat — Touch current user's lastSeenAt */
export const heartbeat = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const now = new Date();
    await prisma.user.update({
      where: { id: req.auth.dbUser.id },
      data: { lastSeenAt: now },
    });

    res.json({ success: true, lastSeenAt: now });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/v1/users/me — Update current user's profile fields */
export const updateMyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { clerkUserId } = req.auth;

  // req.body is already validated and typed by Zod validate() middleware
  const { name, bio, avatarUrl, username } = req.body;

  try {
    // If changing username, check it's not already taken
    if (username && username !== req.auth.dbUser.username) {
      const exists = await prisma.user.findUnique({ where: { username } });
      if (exists) {
        return next(ApiError.conflict("Username is already taken"));
      }
    }

    const updated = await prisma.user.update({
      where: { clerkId: clerkUserId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(username !== undefined ? { username } : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/users/:id — Get a public user profile by internal DB ID */
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        lastSeenAt: true,
        isVerified: true,
        createdAt: true,
        // Never expose clerkId or email in public profiles
      },
    });

    if (!user) {
      return next(ApiError.notFound("User not found"));
    }

    const isOnline = isUserOnline(user.id);

    res.json({
      success: true,
      data: {
        ...user,
        isOnline,
      },
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/users/me/settings — Retrieve current user's settings (creates defaults if none exist) */
export const getMySettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.auth.dbUser.id;

    let settings = await UserSettingsModel.findOne({ userId });

    if (!settings) {
      settings = await UserSettingsModel.create({ userId });
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/v1/users/me/settings — Update current user's settings */
export const updateUserSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const targetUserId = req.auth.dbUser.id;

    let settings = await UserSettingsModel.findOne({ userId: targetUserId });

    if (!settings) {
      settings = new UserSettingsModel({ userId: targetUserId });
    }

    // Safely deep merge updates into document without wiping subdocuments
    settings.set(req.body);

    // Ensure userId remains immutable
    settings.userId = targetUserId;

    await settings.save();

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
