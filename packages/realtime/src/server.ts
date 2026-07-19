/**
 * WebSocket Server with Socket.io
 * Provides real-time inbox updates via WebSocket with Redis pub/sub
 */

import { Server as HTTPServer } from "http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type {
  InboxUpdatePayload,
  NewMessagePayload,
  MessageStatusPayload,
  TypingPayload,
} from "./types";

export interface RealtimeServer {
  io: Server;
  httpServer: HTTPServer;
  emitToUser(userId: string, event: string, data: unknown): void;
  emitInboxUpdate(userId: string, payload: InboxUpdatePayload): void;
  emitNewMessage(userId: string, payload: NewMessagePayload): void;
  emitMessageStatus(userId: string, payload: MessageStatusPayload): void;
  emitTyping(userId: string, payload: TypingPayload): void;
  shutdown(): Promise<void>;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PATH = "/socket.io";
const CORS_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function createRealtimeServer(httpServer: HTTPServer): Promise<RealtimeServer> {
  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  const io = new Server(httpServer, {
    path: PATH,
    cors: {
      origin: CORS_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Use Redis adapter for horizontal scaling
  io.adapter(createAdapter(pubClient, subClient));

  // Authentication middleware
  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId as string | undefined;
    if (!userId) {
      return next(new Error("Authentication required"));
    }
    (socket.data as { userId: string }).userId = userId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    const room = `user:${userId}`;

    socket.join(room);
    console.log(`[Realtime] Client connected: ${userId} (${socket.id})`);

    // Subscribe to user-specific Redis channel
    socket.join(`notifications:${userId}`);

    socket.on("disconnect", () => {
      console.log(`[Realtime] Client disconnected: ${userId}`);
    });

    // Handle thread selection - join thread room for targeted updates
    socket.on("thread:join", (threadId: string) => {
      socket.join(`thread:${threadId}`);
      console.log(`[Realtime] ${userId} joined thread:${threadId}`);
    });

    socket.on("thread:leave", (threadId: string) => {
      socket.leave(`thread:${threadId}`);
    });

    // Typing indicators
    socket.on("typing:start", (data: { threadId: string }) => {
      socket.to(`thread:${data.threadId}`).emit("typing:start", {
        threadId: data.threadId,
        senderId: userId,
        isTyping: true,
      });
    });

    socket.on("typing:stop", (data: { threadId: string }) => {
      socket.to(`thread:${data.threadId}`).emit("typing:stop", {
        threadId: data.threadId,
        senderId: userId,
        isTyping: false,
      });
    });
  });

  return {
    io,

    get httpServer() {
      return httpServer;
    },

    emitToUser(userId: string, event: string, data: unknown): void {
      io.to(`user:${userId}`).emit(event, data);
    },

    emitInboxUpdate(userId: string, payload: InboxUpdatePayload): void {
      this.emitToUser(userId, "inbox:update", payload);
    },

    emitNewMessage(userId: string, payload: NewMessagePayload): void {
      // Emit to user's inbox room
      this.emitToUser(userId, "message:new", payload);
      // Also emit to thread room for open conversations
      io.to(`thread:${payload.threadId}`).emit("message:new", payload);
    },

    emitMessageStatus(userId: string, payload: MessageStatusPayload): void {
      this.emitToUser(userId, "message:status", payload);
    },

    emitTyping(userId: string, payload: TypingPayload): void {
      io.to(`thread:${payload.threadId}`).emit("typing", payload);
    },

    async shutdown(): Promise<void> {
      await io.close();
      await pubClient.quit();
      await subClient.quit();
    },
  };
}

/**
 * Redis pub/sub for cross-process notifications
 */
export interface RealtimePubSub {
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: unknown) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}

export function createRealtimePubSub(redisUrl = REDIS_URL): RealtimePubSub {
  const pub = createClient({ url: redisUrl });
  const sub = pub.duplicate();

  return {
    async publish(channel: string, message: unknown): Promise<void> {
      await pub.publish(channel, JSON.stringify(message));
    },

    async subscribe(channel: string, handler: (message: unknown) => void): Promise<void> {
      await sub.subscribe(channel, (ch, msg) => {
        if (ch === channel) {
          try {
            handler(JSON.parse(msg));
          } catch {
            handler(msg);
          }
        }
      });
    },

    async unsubscribe(channel: string): Promise<void> {
      await sub.unsubscribe(channel);
    },
  };
}