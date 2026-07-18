/**
 * Facebook Messenger Platform Provider
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

export class FacebookPlatformProvider extends MetaBasePlatformProvider {
  readonly platform: PlatformType = "facebook_page";

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

    if (message.imageUrl) {
      return this.sendMessengerImage(
        connection,
        message.recipientId,
        message.imageUrl,
        message.text
      );
    }

    if (message.text) {
      return this.sendMessengerMessage(
        connection,
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
    return this.sendMessengerImage(connection, recipientId, imageUrl, caption);
  }

  parseWebhook(
    payload: unknown,
    _headers: Record<string, string>
  ): WebhookEvent[] {
    const events: WebhookEvent[] = [];
    const data = this.safeJsonParse(payload);

    if (!data || data.object !== "page") {
      return events;
    }

    const entries = Array.isArray(data.entry) ? data.entry : [];

    for (const entry of entries) {
      const entryData = entry as Record<string, unknown>;
      const pageId = String(entryData.id ?? "");

      // Process messaging events
      const messaging = Array.isArray(entryData.messaging)
        ? entryData.messaging
        : [];

      for (const event of messaging) {
        const eventData = event as Record<string, unknown>;
        const parsed = this.parseMessagingEvent(pageId, eventData, data);
        if (parsed) {
          events.push(parsed);
        }
      }

      // Process feed events (comments, etc.)
      const changes = Array.isArray(entryData.changes)
        ? entryData.changes
        : [];

      for (const change of changes) {
        const changeData = change as Record<string, unknown>;
        const parsed = this.parseFeedChange(pageId, changeData, data);
        if (parsed) {
          events.push(parsed);
        }
      }
    }

    return events;
  }

  private parseMessagingEvent(
    pageId: string,
    event: Record<string, unknown>,
    rawPayload: Record<string, unknown>
  ): WebhookEvent | null {
    const sender = event.sender as Record<string, unknown> | undefined;
    const recipient = event.recipient as Record<string, unknown> | undefined;
    const message = event.message as Record<string, unknown> | undefined;
    const postback = event.postback as Record<string, unknown> | undefined;
    const read = event.read as Record<string, unknown> | undefined;
    const delivery = event.delivery as Record<string, unknown> | undefined;

    const senderId = String(sender?.id ?? "");
    const recipientId = String(recipient?.id ?? "");
    const timestamp = Number(event.timestamp ?? Date.now());

    // Skip echo messages (messages sent by the page)
    if (message?.is_echo) {
      return null;
    }

    let eventType: WebhookEventType = "unknown";
    let incomingMessage: IncomingMessage | undefined;

    if (message) {
      const quickReply = message.quick_reply as Record<string, unknown> | undefined;

      if (quickReply?.payload) {
        eventType = "quick_reply";
      } else {
        eventType = "message";
      }

      const attachments = this.parseAttachments(
        message.attachments as unknown[] | undefined
      );

      incomingMessage = {
        id: String(message.mid ?? ""),
        platform: this.platform,
        senderId,
        recipientId: pageId,
        threadId: `${this.platform}:${senderId}`,
        type: attachments.length > 0 ? attachments[0]!.type : "text",
        text: String(message.text ?? ""),
        attachments,
        quickReplyPayload: quickReply?.payload as string | undefined,
        timestamp: new Date(timestamp),
        rawPayload,
      };
    } else if (postback) {
      eventType = "postback";

      incomingMessage = {
        id: String(postback.mid ?? `postback-${timestamp}`),
        platform: this.platform,
        senderId,
        recipientId: pageId,
        threadId: `${this.platform}:${senderId}`,
        type: "postback",
        text: String(postback.title ?? ""),
        postbackPayload: String(postback.payload ?? ""),
        timestamp: new Date(timestamp),
        rawPayload,
      };
    } else if (read) {
      eventType = "message_read";
    } else if (delivery) {
      eventType = "message_delivered";
    }

    return {
      eventId: this.generateEventId([
        this.platform,
        pageId,
        eventType,
        String(message?.mid ?? postback?.mid ?? timestamp),
      ]),
      platform: this.platform,
      eventType,
      accountId: pageId,
      message: incomingMessage,
      rawPayload,
      receivedAt: new Date(),
    };
  }

  private parseFeedChange(
    pageId: string,
    change: Record<string, unknown>,
    rawPayload: Record<string, unknown>
  ): WebhookEvent | null {
    const field = change.field as string | undefined;
    const value = change.value as Record<string, unknown> | undefined;

    if (!value) return null;

    // Handle comments
    if (field === "feed" && value.item === "comment") {
      // Skip edits and deletions
      if (value.verb === "remove" || value.verb === "edited") {
        return null;
      }

      const commentId = String(value.comment_id ?? "");
      const from = value.from as Record<string, unknown> | undefined;
      const senderId = String(from?.id ?? "");
      const senderName = String(from?.name ?? "");

      // Skip comments from the page itself
      if (senderId === pageId) {
        return null;
      }

      const incomingMessage: IncomingMessage = {
        id: commentId,
        platform: this.platform,
        senderId,
        senderName,
        recipientId: pageId,
        threadId: `${this.platform}:comment:${commentId}`,
        type: "comment",
        text: String(value.message ?? ""),
        parentId: String(value.post_id ?? ""),
        timestamp: new Date(),
        rawPayload,
      };

      return {
        eventId: this.generateEventId([
          this.platform,
          pageId,
          "comment",
          commentId,
        ]),
        platform: this.platform,
        eventType: "comment",
        accountId: pageId,
        message: incomingMessage,
        rawPayload,
        receivedAt: new Date(),
      };
    }

    return null;
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

        const mappedType = this.mapAttachmentType(type);
        if (!mappedType) return null;

        return {
          type: mappedType,
          url: String(payload.url),
        };
      })
      .filter((a): a is MessageAttachment => a !== null);
  }

  private mapAttachmentType(
    type: string
  ): MessageAttachment["type"] | null {
    switch (type) {
      case "image":
        return "image";
      case "video":
        return "video";
      case "audio":
        return "audio";
      case "file":
        return "file";
      default:
        return null;
    }
  }
}
