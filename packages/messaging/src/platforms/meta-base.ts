/**
 * Meta Platform Base
 * Shared functionality for Facebook, Instagram, and WhatsApp
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { BasePlatformProvider } from "./base";
import type {
  PlatformConnection,
  SendResult,
  WebhookVerification,
} from "../types";

const FB_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${FB_VERSION}`;

export abstract class MetaBasePlatformProvider extends BasePlatformProvider {
  /**
   * Make a GET request to the Graph API
   */
  protected async graphGet<T = Record<string, unknown>>(
    path: string,
    accessToken: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${GRAPH_API_BASE}${path}`);
    url.searchParams.set("access_token", accessToken);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = new Error(
        `Graph API ${res.status}: ${JSON.stringify(data)}`
      );
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }

    return data as T;
  }

  /**
   * Make a POST request to the Graph API with JSON body
   */
  protected async graphPost<T = Record<string, unknown>>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${GRAPH_API_BASE}${path}`);
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = new Error(
        `Graph API ${res.status}: ${JSON.stringify(data)}`
      );
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }

    return data as T;
  }

  /**
   * Upload media via multipart form
   */
  protected async graphUploadMedia(
    path: string,
    accessToken: string,
    buffer: Buffer,
    contentType: string,
    additionalFields: Record<string, string> = {}
  ): Promise<{ id: string }> {
    const url = new URL(`${GRAPH_API_BASE}${path}`);
    url.searchParams.set("access_token", accessToken);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
    formData.append("file", blob, "media.jpg");

    for (const [key, value] of Object.entries(additionalFields)) {
      formData.append(key, value);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(`Media upload failed: ${res.status} ${JSON.stringify(data)}`);
    }

    return data as { id: string };
  }

  /**
   * Verify Meta webhook signature
   */
  verifyWebhook(
    rawBody: string,
    signature: string | null,
    secret: string
  ): boolean {
    if (!signature?.startsWith("sha256=")) {
      return false;
    }

    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const received = Buffer.from(signature.slice("sha256=".length));
    const actual = Buffer.from(expected);

    if (received.length !== actual.length) {
      return false;
    }

    return timingSafeEqual(received, actual);
  }

  /**
   * Verify Meta webhook subscription (GET request)
   */
  verifySubscription(
    verification: WebhookVerification,
    expectedToken: string
  ): string | null {
    if (
      verification.mode === "subscribe" &&
      verification.token === expectedToken
    ) {
      return verification.challenge;
    }
    return null;
  }

  /**
   * Send text message via Messenger/Instagram
   */
  protected async sendMessengerMessage(
    connection: PlatformConnection,
    recipientId: string,
    text: string
  ): Promise<SendResult> {
    try {
      const response = await this.graphPost<{
        message_id?: string;
        recipient_id?: string;
      }>(`/${connection.accountId}/messages`, connection.accessToken, {
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text },
      });

      return {
        success: true,
        messageId: response.message_id,
        raw: response,
      };
    } catch (err) {
      this.logError("sendMessengerMessage", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Send image via Messenger/Instagram
   */
  protected async sendMessengerImage(
    connection: PlatformConnection,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult> {
    try {
      // Try to download and upload via multipart for better reliability
      const { buffer, contentType } = await this.downloadImage(imageUrl);

      const formData = new FormData();
      formData.append("recipient", JSON.stringify({ id: recipientId }));
      formData.append(
        "message",
        JSON.stringify({
          attachment: {
            type: "image",
            payload: { is_reusable: true },
          },
        })
      );
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
      formData.append("filedata", blob, "image.jpg");

      const url = `${GRAPH_API_BASE}/${connection.accountId}/messages?access_token=${connection.accessToken}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.accessToken}` },
        body: formData,
      });

      const response = (await res.json()) as { message_id?: string };

      if (!res.ok) {
        throw new Error(`Image send failed: ${res.status} ${JSON.stringify(response)}`);
      }

      // Send caption as follow-up if provided
      if (caption) {
        await this.sendMessengerMessage(connection, recipientId, caption);
      }

      return {
        success: true,
        messageId: response.message_id,
        raw: response,
      };
    } catch (err) {
      // Fallback to URL-based sending
      this.log("Falling back to URL-based image send");

      try {
        const response = await this.graphPost<{ message_id?: string }>(
          `/${connection.accountId}/messages`,
          connection.accessToken,
          {
            recipient: { id: recipientId },
            messaging_type: "RESPONSE",
            message: {
              attachment: {
                type: "image",
                payload: { url: imageUrl, is_reusable: true },
              },
            },
          }
        );

        if (caption) {
          await this.sendMessengerMessage(connection, recipientId, caption);
        }

        return {
          success: true,
          messageId: response.message_id,
          raw: response,
        };
      } catch (fallbackErr) {
        this.logError("sendMessengerImage fallback", fallbackErr);
        return {
          success: false,
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        };
      }
    }
  }

  /**
   * Reply to a comment
   */
  async replyToComment(
    connection: PlatformConnection,
    commentId: string,
    text: string
  ): Promise<SendResult> {
    try {
      const path =
        this.platform === "instagram"
          ? `/${commentId}/replies`
          : `/${commentId}/comments`;

      const response = await this.graphPost<{ id?: string }>(
        path,
        connection.accessToken,
        { message: text }
      );

      return {
        success: true,
        messageId: response.id,
        raw: response,
      };
    } catch (err) {
      this.logError("replyToComment", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get user profile from Facebook/Instagram
   */
  async getUserProfile(
    connection: PlatformConnection,
    userId: string
  ): Promise<{ id: string; name?: string; profilePicture?: string } | null> {
    try {
      const data = await this.graphGet<{
        id: string;
        name?: string;
        profile_pic?: string;
      }>(`/${userId}`, connection.accessToken, {
        fields: "id,name,profile_pic",
      });

      return {
        id: data.id,
        name: data.name,
        profilePicture: data.profile_pic,
      };
    } catch {
      return null;
    }
  }
}
