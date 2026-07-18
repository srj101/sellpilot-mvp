/**
 * Messaging Package
 *
 * Unified interface for messaging platforms (Facebook, Instagram, WhatsApp, etc.)
 *
 * Usage:
 *   import { MessagingService, getPlatformProvider } from "@acme/messaging";
 *
 *   const service = new MessagingService();
 *   await service.sendMessage(connection, { recipientId, text: "Hello!" });
 *
 * Adding a new platform:
 *   1. Create a new provider in ./platforms/ extending BasePlatformProvider
 *   2. Register it in ./platforms/index.ts
 *   3. Add the platform type to PlatformType in ./types.ts
 */

export * from "./types";
export * from "./platforms";

import type {
  PlatformType,
  PlatformConnection,
  OutgoingMessage,
  SendResult,
  WebhookEvent,
  IncomingMessage,
  RateLimitConfig,
  RateLimitResult,
} from "./types";

import { getPlatformProvider } from "./platforms";

// ============================================
// Rate Limiter
// ============================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      this.limits.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt: new Date(now + this.config.windowMs),
      };
    }

    if (entry.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  reset(key: string): void {
    this.limits.delete(key);
  }
}

// ============================================
// Messaging Service
// ============================================

export interface MessagingServiceConfig {
  /** Rate limit config per account */
  rateLimit?: RateLimitConfig;
  /** Enable logging */
  logging?: boolean;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 200,
  windowMs: 60 * 60 * 1000, // 1 hour
  scope: "account",
};

export class MessagingService {
  private rateLimiter: RateLimiter;
  private logging: boolean;

  constructor(config: MessagingServiceConfig = {}) {
    this.rateLimiter = new RateLimiter(
      config.rateLimit ?? DEFAULT_RATE_LIMIT
    );
    this.logging = config.logging ?? true;
  }

  /**
   * Send a message via the appropriate platform
   */
  async sendMessage(
    connection: PlatformConnection,
    message: OutgoingMessage
  ): Promise<SendResult> {
    // Check rate limit
    const rateLimitKey = `${connection.platform}:${connection.accountId}`;
    const rateLimit = this.rateLimiter.check(rateLimitKey);

    if (!rateLimit.allowed) {
      this.log(
        "warn",
        `Rate limit exceeded for ${rateLimitKey}, resets at ${rateLimit.resetAt}`
      );
      return {
        success: false,
        error: `Rate limit exceeded. Resets at ${rateLimit.resetAt.toISOString()}`,
      };
    }

    const provider = getPlatformProvider(connection.platform);

    this.log(
      "info",
      `Sending ${message.imageUrl ? "image" : "text"} to ${message.recipientId} via ${connection.platform}`
    );

    const result = await provider.sendMessage(connection, message);

    if (result.success) {
      this.log("info", `Message sent: ${result.messageId}`);
    } else {
      this.log("error", `Message failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Send an image
   */
  async sendImage(
    connection: PlatformConnection,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult> {
    return this.sendMessage(connection, {
      platform: connection.platform,
      recipientId,
      imageUrl,
      text: caption,
    });
  }

  /**
   * Reply to a comment
   */
  async replyToComment(
    connection: PlatformConnection,
    commentId: string,
    text: string
  ): Promise<SendResult> {
    const provider = getPlatformProvider(connection.platform);

    if (!provider.replyToComment) {
      return {
        success: false,
        error: `Platform ${connection.platform} does not support comment replies`,
      };
    }

    this.log("info", `Replying to comment ${commentId}`);

    const result = await provider.replyToComment(connection, commentId, text);

    if (result.success) {
      this.log("info", `Comment reply sent: ${result.messageId}`);
    } else {
      this.log("error", `Comment reply failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Parse webhook payload for any platform
   */
  parseWebhook(
    platform: PlatformType,
    payload: unknown,
    headers: Record<string, string>
  ): WebhookEvent[] {
    const provider = getPlatformProvider(platform);
    return provider.parseWebhook(payload, headers);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(
    platform: PlatformType,
    rawBody: string,
    signature: string | null,
    secret: string
  ): boolean {
    const provider = getPlatformProvider(platform);
    return provider.verifyWebhook(rawBody, signature, secret);
  }

  /**
   * Verify webhook subscription (GET request)
   */
  verifySubscription(
    platform: PlatformType,
    mode: string,
    token: string,
    challenge: string,
    expectedToken: string
  ): string | null {
    const provider = getPlatformProvider(platform);
    if (!provider.verifySubscription) {
      return null;
    }
    return provider.verifySubscription({ mode, token, challenge }, expectedToken);
  }

  /**
   * Get user profile
   */
  async getUserProfile(
    connection: PlatformConnection,
    userId: string
  ): Promise<{ id: string; name?: string; profilePicture?: string } | null> {
    const provider = getPlatformProvider(connection.platform);
    if (!provider.getUserProfile) {
      return null;
    }
    return provider.getUserProfile(connection, userId);
  }

  /**
   * Download media from platform
   */
  async downloadMedia(
    connection: PlatformConnection,
    mediaId: string
  ): Promise<{ url: string; buffer?: Buffer; mimeType?: string } | null> {
    const provider = getPlatformProvider(connection.platform);
    if (!provider.downloadMedia) {
      return null;
    }
    return provider.downloadMedia(connection, mediaId);
  }

  /**
   * Check rate limit status
   */
  getRateLimitStatus(
    platform: PlatformType,
    accountId: string
  ): RateLimitResult {
    return this.rateLimiter.check(`${platform}:${accountId}`);
  }

  /**
   * Reset rate limit for an account
   */
  resetRateLimit(platform: PlatformType, accountId: string): void {
    this.rateLimiter.reset(`${platform}:${accountId}`);
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    if (!this.logging) return;

    const prefix = "[Messaging]";
    switch (level) {
      case "info":
        console.log(prefix, message);
        break;
      case "warn":
        console.warn(prefix, message);
        break;
      case "error":
        console.error(prefix, message);
        break;
    }
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a message is inbound (from customer)
 */
export function isInboundMessage(message: IncomingMessage): boolean {
  return message.type !== "comment"; // Comments are handled separately
}

/**
 * Check if a message is a comment
 */
export function isComment(message: IncomingMessage): boolean {
  return message.type === "comment";
}

/**
 * Extract text content from a message
 */
export function getMessageText(message: IncomingMessage): string {
  return (
    message.text ??
    message.quickReplyPayload ??
    message.postbackPayload ??
    ""
  );
}

/**
 * Check if message has attachments
 */
export function hasAttachments(message: IncomingMessage): boolean {
  return (message.attachments?.length ?? 0) > 0;
}

/**
 * Get image attachments from a message
 */
export function getImageAttachments(message: IncomingMessage): string[] {
  return (
    message.attachments
      ?.filter((a) => a.type === "image")
      .map((a) => a.url) ?? []
  );
}

// Default service instance
let defaultService: MessagingService | null = null;

/**
 * Get the default messaging service instance
 */
export function getMessagingService(): MessagingService {
  if (!defaultService) {
    defaultService = new MessagingService();
  }
  return defaultService;
}

/**
 * Create a new messaging service with custom config
 */
export function createMessagingService(
  config: MessagingServiceConfig
): MessagingService {
  return new MessagingService(config);
}
