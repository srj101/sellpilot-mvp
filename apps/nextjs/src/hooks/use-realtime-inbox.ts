/**
 * Client-side realtime hook for inbox updates
 * Falls back to polling if WebSocket unavailable
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import type {
  InboxUpdatePayload,
  NewMessagePayload,
  TypingPayload,
} from "@acme/realtime";

interface RealtimeState {
  unreadCount: number;
  latestThreadId: string | null;
  isConnected: boolean;
  typingUsers: Record<string, string[]>; // threadId -> userIds
  setUnreadCount: (count: number) => void;
  setTyping: (threadId: string, userId: string, isTyping: boolean) => void;
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  unreadCount: 0,
  latestThreadId: null,
  isConnected: false,
  typingUsers: {},
  setUnreadCount: (count) => set({ unreadCount: count }),
  setTyping: (threadId, userId, isTyping) =>
    set((state) => {
      const current = state.typingUsers[threadId] ?? [];
      if (isTyping && !current.includes(userId)) {
        return { typingUsers: { ...state.typingUsers, [threadId]: [...current, userId] } };
      } else if (!isTyping) {
        return { typingUsers: { ...state.typingUsers, [threadId]: current.filter((u) => u !== userId) } };
      }
      return state;
    }),
  reset: () => set({ unreadCount: 0, latestThreadId: null, isConnected: false, typingUsers: {} }),
}));

export interface UseRealtimeOptions {
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Enable SSE fallback */
  enableSSE?: boolean;
}

export function useRealtimeInbox(options: UseRealtimeOptions = {}) {
  const { autoConnect = true, enableSSE = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const { setUnreadCount, setTyping } = useRealtimeStore();

  const connectSSE = useCallback(() => {
    if (!enableSSE) return;
    const sse = new EventSource("/api/sse/inbox");
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "inbox_update") {
          setUnreadCount(data.data.unreadCount);
        }
      } catch {
        // Ignore parse errors
      }
    };
    sse.onerror = () => {
      sse.close();
    };
    sseRef.current = sse;
  }, [enableSSE, setUnreadCount]);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    // Try WebSocket first
    const socket = io("/socket.io", {
      path: "/socket.io",
      auth: { userId: window.__USER_ID__ },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      useRealtimeStore.setState({ isConnected: true });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      useRealtimeStore.setState({ isConnected: false });
    });

    socket.on("inbox:update", (payload: InboxUpdatePayload) => {
      setUnreadCount(payload.unreadCount);
    });

    socket.on("message:new", (payload: NewMessagePayload) => {
      // Trigger any components listening
      window.dispatchEvent(
        new CustomEvent("inbox:message", { detail: payload })
      );
    });

    socket.on("typing", (payload: TypingPayload) => {
      setTyping(payload.threadId, payload.senderId, payload.isTyping);
    });

    socketRef.current = socket;

    // Fallback to SSE after 3 seconds if WebSocket doesn't connect
    setTimeout(() => {
      if (!socket.connected) {
        connectSSE();
      }
    }, 3000);
  }, [connectSSE, setUnreadCount, setTyping]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    sseRef.current?.close();
    setIsConnected(false);
    useRealtimeStore.setState({ isConnected: false });
  }, []);

  const emitTyping = useCallback((threadId: string, isTyping: boolean) => {
    socketRef.current?.emit(isTyping ? "typing:start" : "typing:stop", { threadId });
  }, []);

  const joinThread = useCallback((threadId: string) => {
    socketRef.current?.emit("thread:join", threadId);
  }, []);

  const leaveThread = useCallback((threadId: string) => {
    socketRef.current?.emit("thread:leave", threadId);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    emitTyping,
    joinThread,
    leaveThread,
  };
}

/**
 * Hook for real-time inbox badge count
 */
export function useInboxUnreadCount() {
  const unreadCount = useRealtimeStore((s) => s.unreadCount);
  return { unreadCount };
}

/**
 * Hook for typing indicators in a thread
 */
export function useTypingUsers(threadId: string) {
  const typingUsers = useRealtimeStore((s) => s.typingUsers[threadId] ?? []);
  return { typingUsers };
}

/**
 * Hook for new messages in a thread
 */
export function useNewMessages(threadId: string, onMessage: (msg: NewMessagePayload) => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<NewMessagePayload>).detail;
      if (msg.threadId === threadId) {
        onMessage(msg);
      }
    };
    window.addEventListener("inbox:message", handler);
    return () => window.removeEventListener("inbox:message", handler);
  }, [threadId, onMessage]);
}
