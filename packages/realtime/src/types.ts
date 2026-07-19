/**
 * Realtime Types
 */

export type InboxEventType =
  | "inbox:update"
  | "message:new"
  | "message:status"
  | "typing:start"
  | "typing:stop"
  | "thread:select";

export interface InboxUpdatePayload {
  unreadCount: number;
  latestEventId: string | null;
  threadId?: string;
}

export interface NewMessagePayload {
  threadId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  text?: string;
  timestamp: number;
  platform: "facebook_page" | "instagram" | "whatsapp";
  direction: "inbound" | "outbound";
}

export interface MessageStatusPayload {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: number;
}

export interface TypingPayload {
  threadId: string;
  senderId: string;
  isTyping: boolean;
}

export interface ThreadSelectPayload {
  threadId: string;
}

/** SSE event types for fallback */
export interface SSENewMessageEvent {
  type: "message";
  data: NewMessagePayload;
}

export interface SSEInboxUpdateEvent {
  type: "inbox_update";
  data: InboxUpdatePayload;
}

export type SSEEvent = SSENewMessageEvent | SSEInboxUpdateEvent;

/** LLM Cache types */
export interface LLMCacheEntry {
  response: string;
  model: string;
  cachedAt: number;
  tokenCount: number;
}

export interface LLMCacheOptions {
  /** TTL in seconds, default 1 hour */
  ttl?: number;
  /** Enable client-scoped deduplication */
  clientScope?: boolean;
}