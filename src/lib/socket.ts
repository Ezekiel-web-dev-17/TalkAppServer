import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import { verifyToken } from "@clerk/backend";
import { User } from "@prisma/client";
import { CLERK_SECRET_KEY, CLIENT_URL } from "../config/env.config.js";
import prisma from "./prisma.js";
import logger from "./logger.js";

interface AuthenticatedSocket extends Socket {
  data: {
    user: User;
    clerkUserId: string;
  };
}

let io: Server | null = null;

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
      const authHeader =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization;

      if (!authHeader) {
        return next(new Error("Authentication error: No token provided"));
      }

      const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

      const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
      const clerkUserId = payload.sub;

      if (!clerkUserId) {
        return next(new Error("Authentication error: Invalid token subject"));
      }

      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        return next(new Error("Authentication error: User not found in database"));
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

    logger.info(`[SOCKET] Client connected: user=${user.username} (${user.id}) socket=${socket.id}`);

    // Join personal user room for direct push notifications
    socket.join(`user:${user.id}`);

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
          logger.debug(`[SOCKET] User ${user.username} joined room conversation:${conversationId}`);
        } else {
          socket.emit("error", { message: "Not authorized to join this conversation" });
        }
      } catch (err) {
        logger.error(`[SOCKET] join_conversation error:`, err);
      }
    });

    // Leave a conversation room
    socket.on("leave_conversation", (conversationId: string) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        logger.debug(`[SOCKET] User ${user.username} left room conversation:${conversationId}`);
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

    socket.on("disconnect", (reason) => {
      logger.info(`[SOCKET] Client disconnected: user=${user.username} reason=${reason}`);
    });
  });

  return io;
}

/**
 * Get the initialized Socket.io instance for broadcasting events from controllers.
 */
export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.io has not been initialized. Call initSocket(server) first.");
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

export function emitMessageEdited(conversationId: string, message: unknown): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("message_edited", message);
  }
}

export function emitMessageDeleted(conversationId: string, messageId: string): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("message_deleted", {
      conversationId,
      messageId,
    });
  }
}

export function emitReactionUpdated(
  conversationId: string,
  data: { messageId: string; reactions: unknown }
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("reaction_updated", data);
  }
}

export function emitMessagesRead(
  conversationId: string,
  data: { conversationId: string; userId: string; readAt: Date }
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit("messages_read", data);
  }
}
