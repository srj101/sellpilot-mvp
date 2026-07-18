/**
 * Messaging Package Type Definitions
 * Unified interface for all messaging platforms
 */

// ============================================
// Platform Types
// ============================================

export type PlatformType =
  | "facebook_page"
  | "instagram"
  | "whatsapp"
  | "telegram"
  | "line"
  | "viber";

export type MessageDirection = "inbound" | "outbound";

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "location"
  | "sticker"
  | "quick_reply"
  | "postback"
  | "comment";

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

// ============================================
// Message Types
// ============================================

export interface MessageAttachment {
  type: "image" | "video" | "audio" | "file";
  url: string;
  mimeType?: string;
  filename?: string;
  size?: number;
  /** For image attachments: base64 encoded data */
  base64?: string;
}

export interface MessageLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface QuickReply {
  type: "text" | "location" | "email" | "phone";
  title: string;
  payload: string;
  imageUrl?: string;
}

export interface IncomingMessage {
  /** Unique message ID from the platform */
  id: string;
  /** Platform type */
  platform: PlatformType;
  /** Sender ID on the platform */
  senderId: string;
  /** Sender name if available */
  senderName?: string;
  /** Recipient/page/account ID */
  recipientId: string;
  /** Thread/conversation ID */
  threadId: string;
  /** Message type */
  type: MessageType;
  /** Text content */
  text?: string;
  /** Attachments (images, files, etc.) */
  attachments?: MessageAttachment[];
  /** Location data */
  location?: MessageLocation;
  /** Quick reply payload */
  quickReplyPayload?: string;
  /** Postback payload */
  postbackPayload?: string;
  /** For comments: the post/media ID */
  parentId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Raw platform payload for debugging */
  rawPayload?: Record<string, unknown>;
}

export interface OutgoingMessage {
  /** Platform type */
  platform: PlatformType;
  /** Recipient ID */
  recipientId: string;
  /** Text content */
  text?: string;
  /** Image URL to send */
  imageUrl?: string;
  /** Attachments */
  attachments?: MessageAttachment[];
  /** Quick replies to show */
  quickReplies?: QuickReply[];
  /** For comment replies: the comment ID to reply to */
  replyToCommentId?: string;
  /** Message tag (for Facebook) */
  tag?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: unknown;
}

// ============================================
// Connection Types
// ============================================

export interface PlatformConnection {
  id: string;
  platform: PlatformType;
  userId: string;
  /** Platform-specific account ID */
  accountId: string;
  /** Account name/title */
  accountName?: string;
  /** Access token */
  accessToken: string;
  /** Token expiry */
  tokenExpiresAt?: Date;
  /** Additional platform-specific data */
  metadata?: Record<string, unknown>;
  /** Connection status */
  isActive: boolean;
  connectedAt: Date;
}

// ============================================
// Webhook Types
// ============================================

export interface WebhookEvent {
  /** Event ID for deduplication */
  eventId: string;
  /** Platform type */
  platform: PlatformType;
  /** Event type */
  eventType: WebhookEventType;
  /** Platform account ID */
  accountId: string;
  /** Parsed message (if message event) */
  message?: IncomingMessage;
  /** Raw payload */
  rawPayload: Record<string, unknown>;
  /** Received timestamp */
  receivedAt: Date;
}

export type WebhookEventType =
  | "message"
  | "message_read"
  | "message_delivered"
  | "postback"
  | "quick_reply"
  | "comment"
  | "reaction"
  | "typing"
  | "seen"
  | "unknown";

export interface WebhookVerification {
  mode: string;
  token: string;
  challenge: string;
}

// ============================================
// Platform Provider Interface
// ============================================

export interface PlatformProvider {
  /** Platform identifier */
  readonly platform: PlatformType;

  /** Send a message */
  sendMessage(
    connection: PlatformConnection,
    message: OutgoingMessage
  ): Promise<SendResult>;

  /** Send an image */
  sendImage(
    connection: PlatformConnection,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult>;

  /** Reply to a comment */
  replyToComment?(
    connection: PlatformConnection,
    commentId: string,
    text: string
  ): Promise<SendResult>;

  /** Parse incoming webhook payload */
  parseWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): WebhookEvent[];

  /** Verify webhook signature */
  verifyWebhook(
    rawBody: string,
    signature: string | null,
    secret: string
  ): boolean;

  /** Verify webhook subscription (GET request) */
  verifySubscription?(verification: WebhookVerification, token: string): string | null;

  /** Get user profile */
  getUserProfile?(
    connection: PlatformConnection,
    userId: string
  ): Promise<{ id: string; name?: string; profilePicture?: string } | null>;

  /** Download media from platform */
  downloadMedia?(
    connection: PlatformConnection,
    mediaId: string
  ): Promise<{ url: string; buffer?: Buffer; mimeType?: string } | null>;
}

// ============================================
// Rate Limiting
// ============================================

export interface RateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Per-account vs global */
  scope: "account" | "global";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// ============================================
// Logging
// ============================================

export interface MessageLog {
  id: string;
  platform: PlatformType;
  direction: MessageDirection;
  connectionId: string;
  userId: string;
  senderId?: string;
  recipientId: string;
  threadId: string;
  messageType: MessageType;
  text?: string;
  attachments?: MessageAttachment[];
  status: MessageStatus;
  platformMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
