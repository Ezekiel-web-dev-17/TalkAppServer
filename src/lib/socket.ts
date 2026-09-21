import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import { verifyToken } from "@clerk/backend";
import { User } from "@prisma/client";
import { CLERK_SECRET_KEY, CLIENT_URL } from "../config/env.config.js";
import prisma from "./prisma.js";
import logger from "./logger.js";
import { getAuthTokenFromCookies } from "../helpers/cookie.helper.js";

interface AuthenticatedSocket extends Socket {
  data: {
    user: User;
    clerkUserId: string;
  };
}

let io: Server | null = null;

// In-memory active user socket tracking (handles multi-device/multi-tab connections)
const userSocketCounts = new Map<string, number>();

/** Check whether a user has at least one active WebSocket connection */
export function isUserOnline(userId: string): boolean {
  return (userSocketCounts.get(userId) || 0) > 0;
}

/**
 * Initialize Socket.io server and bind event handlers.
 */
export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: CLIENT_URL || "*",
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication Middleware for WebSocket Connections
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers?.cookie;
      const token =
        getAuthTokenFromCookies(undefined, cookieHeader) ||
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.split(" ")[1]
          : socket.handshake.headers?.authorization);

      if (!token) {
        return next(new Error("Authentication error: No session cookie provided"));
      }

      const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
      const clerkUserId = payload.sub;

      if (!clerkUserId) {
        return next(new Error("Authentication error: Invalid token subject"));
      }

      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        return next(
          new Error("Authentication error: User not found in database"),
        );
      }

      socket.data.user = user;
      socket.data.clerkUserId = clerkUserId;

      next();
    } catch (err) {
      logger.warn(`[SOCKET] Authentication failed: ${(err as Error).message}`);
      next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const user = authSocket.data.user;

    // Track active connection count
    const activeCount = (userSocketCounts.get(user.id) || 0) + 1;
    userSocketCounts.set(user.id, activeCount);

    logger.info(
      `[SOCKET] Client connected: user=${user.username} (${user.id}) socket=${socket.id} (active=${activeCount})`,
    );

    // Join personal user room for direct push notifications
    socket.join(`user:${user.id}`);

    // If this is the user's first active connection, broadcast that they are ONLINE
    if (activeCount === 1) {
      io?.emit("user_presence", {
        userId: user.id,
        username: user.username,
        isOnline: true,
        lastSeenAt: null,
      });
    }

    // Join a conversation room (with membership authorization)
    socket.on("join_conversation", async (conversationId: string) => {
      try {
        if (!conversationId) return;

        const isMember = await prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: user.id,
            },
          },
        });

        if (isMember) {
          socket.join(`conversation:${conversationId}`);
          logger.debug(
            `[SOCKET] User ${user.username} joined room conversation:${conversationId}`,
          );
        } else {
          socket.emit("error", {
            message: "Not authorized to join this conversation",
          });
        }
      } catch (err) {
        logger.error(`[SOCKET] join_conversation error:`, err);
      }
    });

    // Leave a conversation room
    socket.on("leave_conversation", (conversationId: string) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        logger.debug(
          `[SOCKET] User ${user.username} left room conversation:${conversationId}`,
        );
      }
    });

    // Typing indicators
    socket.on("typing_start", (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.to(`conversation:${data.conversationId}`).emit("user_typing", {
          conversationId: data.conversationId,
          userId: user.id,
          username: user.username,
          isTyping: true,
        });
      }
    });

    socket.on("typing_stop", (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.to(`conversation:${data.conversationId}`).emit("user_typing", {
          conversationId: data.conversationId,
          userId: user.id,
          username: user.username,
          isTyping: false,
        });
      }
    });

    socket.on("disconnect", async (reason) => {
      const remaining = (userSocketCounts.get(user.id) || 1) - 1;

      if (remaining <= 0) {
        userSocketCounts.delete(user.id);
        const now = new Date();

        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastSeenAt: now },
          });
        } catch (dbErr) {
          logger.error(`[SOCKET] Error updating lastSeenAt:`, dbErr);
        }

        // Broadcast to all clients that user went OFFLINE
        io?.emit("user_presence", {
          userId: user.id,
          username: user.username,
          isOnline: false,
          lastSeenAt: now,
        });

        logger.info(`[SOCKET] User ${user.username} went OFFLINE (reason: ${reason})`);
      } else {
        userSocketCounts.set(user.id, remaining);
        logger.debug(`[SOCKET] User ${user.username} closed one tab (${remaining} remaining)`);
      }
    });
  });

  return io;
}

/**
 * Get the initialized Socket.io instance for broadcasting events from controllers.
 */
export function getIO(): Server {
  if (!io) {
    throw new Error(
      "Socket.io has not been initialized. Call initSocket(server) first.",
    );
  }
  return io;
}

// ─────────────────────────────────────────────
// Real-time Event Broadcasters
// ─────────────────────────────────────────────

export function emitNewMessage(conversationId: string, message: unknown): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("new_message", message);
  }
}

export function emitMessageEdited(
  conversationId: string,
  message: unknown,
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("message_edited", message);
  }
}

export function emitMessageDeleted(
  conversationId: string,
  messageId: string,
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("message_deleted", {
      conversationId,
      messageId,
    });
  }
}

export function emitReactionUpdated(
  conversationId: string,
  data: { messageId: string; reactions: unknown },
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("reaction_updated", data);
  }
}

export function emitMessagesRead(
  conversationId: string,
  data: { conversationId: string; userId: string; readAt: Date },
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("messages_read", data);
  }
}
