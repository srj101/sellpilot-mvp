/**
 * Instagram Platform Provider
 */

import { MetaBasePlatformProvider } from "./meta-base";
import type {
  PlatformType,
  PlatformConnection,
  OutgoingMessage,
  SendResult,
  WebhookEvent,
  WebhookEventType,
  IncomingMessage,
  MessageAttachment,
} from "../types";

export class InstagramPlatformProvider extends MetaBasePlatformProvider {
  readonly platform: PlatformType = "instagram";

  async sendMessage(
    connection: PlatformConnection,
    message: OutgoingMessage
  ): Promise<SendResult> {
    if (message.replyToCommentId) {
      return this.replyToComment(
        connection,
        message.replyToCommentId,
        message.text ?? ""
      );
    }

    // Instagram DMs require the Facebook Page ID, not the IG account ID
    const pageId =
      (connection.metadata?.facebookPageId as string) ?? connection.accountId;

    if (message.imageUrl) {
      return this.sendInstagramImage(
        connection,
        pageId,
        message.recipientId,
        message.imageUrl,
        message.text
      );
    }

    if (message.text) {
      return this.sendInstagramMessage(
        connection,
        pageId,
        message.recipientId,
        message.text
      );
    }

    return { success: false, error: "No content to send" };
  }

  async sendImage(
    connection: PlatformConnection,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult> {
    const pageId =
      (connection.metadata?.facebookPageId as string) ?? connection.accountId;
    return this.sendInstagramImage(
      connection,
      pageId,
      recipientId,
      imageUrl,
      caption
    );
  }

  private async sendInstagramMessage(
    connection: PlatformConnection,
    pageId: string,
    recipientId: string,
    text: string
  ): Promise<SendResult> {
    try {
      // Instagram uses the Facebook Page's /messages endpoint
      const response = await this.graphPost<{ message_id?: string }>(
        `/${pageId}/messages`,
        connection.accessToken,
        {
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text },
        }
      );

      return {
        success: true,
        messageId: response.message_id,
        raw: response,
      };
    } catch (err) {
      this.logError("sendInstagramMessage", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async sendInstagramImage(
    connection: PlatformConnection,
    pageId: string,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult> {
    try {
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

      const url = `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0"}/${pageId}/messages?access_token=${connection.accessToken}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.accessToken}` },
        body: formData,
      });

      const response = (await res.json()) as { message_id?: string };

      if (!res.ok) {
        throw new Error(`Image send failed: ${res.status}`);
      }

      if (caption) {
        await this.sendInstagramMessage(connection, pageId, recipientId, caption);
      }

      return {
        success: true,
        messageId: response.message_id,
        raw: response,
      };
    } catch (err) {
      this.logError("sendInstagramImage", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  parseWebhook(
    payload: unknown,
    _headers: Record<string, string>
  ): WebhookEvent[] {
    const events: WebhookEvent[] = [];
    const data = this.safeJsonParse(payload);

    if (!data || data.object !== "instagram") {
      return events;
    }

    const entries = Array.isArray(data.entry) ? data.entry : [];

    for (const entry of entries) {
      const entryData = entry as Record<string, unknown>;
      const accountId = String(entryData.id ?? "");

      // Process messaging events
      const messaging = Array.isArray(entryData.messaging)
        ? entryData.messaging
        : [];

      for (const event of messaging) {
        const eventData = event as Record<string, unknown>;
        const parsed = this.parseMessagingEvent(accountId, eventData, data);
        if (parsed) {
          events.push(parsed);
        }
      }

      // Process comment events
      const changes = Array.isArray(entryData.changes)
        ? entryData.changes
        : [];

      for (const change of changes) {
        const changeData = change as Record<string, unknown>;
        const parsed = this.parseCommentChange(accountId, changeData, data);
        if (parsed) {
          events.push(parsed);
        }
      }
    }

    return events;
  }

  private parseMessagingEvent(
    accountId: string,
    event: Record<string, unknown>,
    rawPayload: Record<string, unknown>
  ): WebhookEvent | null {
    const sender = event.sender as Record<string, unknown> | undefined;
    const recipient = event.recipient as Record<string, unknown> | undefined;
    const message = event.message as Record<string, unknown> | undefined;
    const postback = event.postback as Record<string, unknown> | undefined;

    const senderId = String(sender?.id ?? "");
    const recipientId = String(recipient?.id ?? "");
    const timestamp = Number(event.timestamp ?? Date.now());

    // Skip echo messages
    if (message?.is_echo) {
      return null;
    }

    let eventType: WebhookEventType = "unknown";
    let incomingMessage: IncomingMessage | undefined;

    if (message) {
      eventType = "message";

      const attachments = this.parseAttachments(
        message.attachments as unknown[] | undefined
      );

      incomingMessage = {
        id: String(message.mid ?? ""),
        platform: this.platform,
        senderId,
        recipientId: accountId,
        threadId: `${this.platform}:${senderId}`,
        type: attachments.length > 0 ? attachments[0]!.type : "text",
        text: String(message.text ?? ""),
        attachments,
        timestamp: new Date(timestamp),
        rawPayload,
      };
    } else if (postback) {
      eventType = "postback";

      incomingMessage = {
        id: String(postback.mid ?? `postback-${timestamp}`),
        platform: this.platform,
        senderId,
        recipientId: accountId,
        threadId: `${this.platform}:${senderId}`,
        type: "postback",
        text: String(postback.title ?? ""),
        postbackPayload: String(postback.payload ?? ""),
        timestamp: new Date(timestamp),
        rawPayload,
      };
    }

    if (!incomingMessage) {
      return null;
    }

    return {
      eventId: this.generateEventId([
        this.platform,
        accountId,
        eventType,
        incomingMessage.id,
      ]),
      platform: this.platform,
      eventType,
      accountId,
      message: incomingMessage,
      rawPayload,
      receivedAt: new Date(),
    };
  }

  private parseCommentChange(
    accountId: string,
    change: Record<string, unknown>,
    rawPayload: Record<string, unknown>
  ): WebhookEvent | null {
    const field = change.field as string | undefined;
    const value = change.value as Record<string, unknown> | undefined;

    if (field !== "comments" || !value) {
      return null;
    }

    // Skip edits and deletions
    if (value.verb === "remove" || value.verb === "edited") {
      return null;
    }

    const commentId = String(value.id ?? "");
    const from = value.from as Record<string, unknown> | undefined;
    const senderId = String(from?.id ?? "");
    const senderName = String(from?.username ?? "");

    // Skip comments from the account itself
    if (senderId === accountId) {
      return null;
    }

    const incomingMessage: IncomingMessage = {
      id: commentId,
      platform: this.platform,
      senderId,
      senderName,
      recipientId: accountId,
      threadId: `${this.platform}:comment:${commentId}`,
      type: "comment",
      text: String(value.text ?? ""),
      parentId: String((value.media as Record<string, unknown>)?.id ?? ""),
      timestamp: new Date(),
      rawPayload,
    };

    return {
      eventId: this.generateEventId([
        this.platform,
        accountId,
        "comment",
        commentId,
      ]),
      platform: this.platform,
      eventType: "comment",
      accountId,
      message: incomingMessage,
      rawPayload,
      receivedAt: new Date(),
    };
  }

  private parseAttachments(
    attachments: unknown[] | undefined
  ): MessageAttachment[] {
    if (!attachments) return [];

    return attachments
      .map((att) => {
        const attachment = att as Record<string, unknown>;
        const type = attachment.type as string;
        const payload = attachment.payload as Record<string, unknown> | undefined;

        if (!payload?.url) return null;

        if (type === "image" || type === "video" || type === "audio") {
          return {
            type: type as MessageAttachment["type"],
            url: String(payload.url),
          };
        }

        return null;
      })
      .filter((a): a is MessageAttachment => a !== null);
  }
}
