/**
 * Base Platform Provider
 * Common functionality for all messaging platforms
 */

import type {
  PlatformProvider,
  PlatformType,
  PlatformConnection,
  OutgoingMessage,
  SendResult,
  WebhookEvent,
  WebhookVerification,
} from "../types";

export abstract class BasePlatformProvider implements PlatformProvider {
  abstract readonly platform: PlatformType;

  abstract sendMessage(
    connection: PlatformConnection,
    message: OutgoingMessage
  ): Promise<SendResult>;

  abstract sendImage(
    connection: PlatformConnection,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult>;

  abstract parseWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): WebhookEvent[];

  abstract verifyWebhook(
    rawBody: string,
    signature: string | null,
    secret: string
  ): boolean;

  /**
   * Download an image from URL and return as buffer
   */
  protected async downloadImage(
    url: string
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download image: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return { buffer, contentType };
  }

  /**
   * Generate a unique event ID for deduplication
   */
  protected generateEventId(parts: (string | undefined)[]): string {
    const filtered = parts.filter(Boolean).join(":");
    if (filtered.length > 0) {
      return filtered;
    }
    return `${this.platform}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Safe JSON parse
   */
  protected safeJsonParse(data: unknown): Record<string, unknown> | null {
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    if (typeof data === "object" && data !== null) {
      return data as Record<string, unknown>;
    }
    return null;
  }

  /**
   * Log platform action
   */
  protected log(action: string, data?: Record<string, unknown>): void {
    console.log(`[${this.platform}] ${action}`, data ?? "");
  }

  /**
   * Log platform error
   */
  protected logError(action: string, error: unknown): void {
    console.error(
      `[${this.platform}] ${action}`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
