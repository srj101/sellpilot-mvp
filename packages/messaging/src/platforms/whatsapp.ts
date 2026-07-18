/**
 * WhatsApp Cloud API Platform Provider
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

export class WhatsAppPlatformProvider extends MetaBasePlatformProvider {
  readonly platform: PlatformType = "whatsapp";

  async sendMessage(
    connection: PlatformConnection,
    message: OutgoingMessage
  ): Promise<SendResult> {
    // Check if using OpenWA (unofficial WhatsApp API)
    if (connection.accessToken.startsWith("user-")) {
      return this.sendViaOpenWA(connection, message);
    }

    if (message.imageUrl) {
      return this.sendWhatsAppImage(
        connection,
        message.recipientId,
        message.imageUrl,
        message.text
      );
    }

    if (message.text) {
      return this.sendWhatsAppText(
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
    if (connection.accessToken.startsWith("user-")) {
      return this.sendViaOpenWA(connection, {
        platform: this.platform,
        recipientId,
        imageUrl,
        text: caption,
      });
    }

    return this.sendWhatsAppImage(connection, recipientId, imageUrl, caption);
  }

  private async sendWhatsAppText(
    connection: PlatformConnection,
    recipientId: string,
    text: string
  ): Promise<SendResult> {
    try {
      const response = await this.graphPost<{
        messages?: { id: string }[];
      }>(`/${connection.accountId}/messages`, connection.accessToken, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "text",
        text: { body: text },
      });

      return {
        success: true,
        messageId: response.messages?.[0]?.id,
        raw: response,
      };
    } catch (err) {
      this.logError("sendWhatsAppText", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async sendWhatsAppImage(
    connection: PlatformConnection,
    recipientId: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendResult> {
    try {
      // Download and upload the image first
      const { buffer, contentType } = await this.downloadImage(imageUrl);

      // Upload to WhatsApp media endpoint
      const uploadForm = new FormData();
      uploadForm.append("messaging_product", "whatsapp");
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
      uploadForm.append("file", blob, "image.jpg");

      const FB_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";
      const uploadRes = await fetch(
        `https://graph.facebook.com/${FB_VERSION}/${connection.accountId}/media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${connection.accessToken}` },
          body: uploadForm,
        }
      );

      if (!uploadRes.ok) {
        throw new Error(`Media upload failed: ${uploadRes.status}`);
      }

      const uploadData = (await uploadRes.json()) as { id: string };
      const mediaId = uploadData.id;

      // Send message with media ID
      const response = await this.graphPost<{
        messages?: { id: string }[];
      }>(`/${connection.accountId}/messages`, connection.accessToken, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "image",
        image: {
          id: mediaId,
          caption: caption || undefined,
        },
      });

      return {
        success: true,
        messageId: response.messages?.[0]?.id,
        raw: response,
      };
    } catch (err) {
      // Fallback to URL-based sending
      this.log("Falling back to URL-based image send");

      try {
        const response = await this.graphPost<{
          messages?: { id: string }[];
        }>(`/${connection.accountId}/messages`, connection.accessToken, {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientId,
          type: "image",
          image: {
            link: imageUrl,
            caption: caption || undefined,
          },
        });

        return {
          success: true,
          messageId: response.messages?.[0]?.id,
          raw: response,
        };
      } catch (fallbackErr) {
        this.logError("sendWhatsAppImage fallback", fallbackErr);
        return {
          success: false,
          error:
            fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr),
        };
      }
    }
  }

  private async sendViaOpenWA(
    connection: PlatformConnection,
    message: OutgoingMessage
  ): Promise<SendResult> {
    // OpenWA integration - uses unofficial WhatsApp API
    const baseUrl = process.env.OPENWA_API_URL ?? "http://localhost:8080";
    const sessionId = connection.accessToken.replace("user-", "");

    try {
      if (message.imageUrl) {
        const { buffer, contentType } = await this.downloadImage(
          message.imageUrl
        );
        const base64Data = buffer.toString("base64");
        const dataUrl = `data:${contentType};base64,${base64Data}`;

        const res = await fetch(`${baseUrl}/api/${sessionId}/send-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: message.recipientId,
            base64: dataUrl,
            caption: message.text ?? "",
          }),
        });

        const data = (await res.json()) as { id?: string };
        return {
          success: res.ok,
          messageId: data.id,
          raw: data,
        };
      }

      const res = await fetch(`${baseUrl}/api/${sessionId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: message.recipientId,
          message: message.text,
        }),
      });

      const data = (await res.json()) as { id?: string };
      return {
        success: res.ok,
        messageId: data.id,
        raw: data,
      };
    } catch (err) {
      this.logError("sendViaOpenWA", err);
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

    if (!data || data.object !== "whatsapp_business_account") {
      return events;
    }

    const entries = Array.isArray(data.entry) ? data.entry : [];

    for (const entry of entries) {
      const entryData = entry as Record<string, unknown>;
      const changes = Array.isArray(entryData.changes)
        ? entryData.changes
        : [];

      for (const change of changes) {
        const changeData = change as Record<string, unknown>;
        const value = changeData.value as Record<string, unknown> | undefined;

        if (!value) continue;

        const metadata = value.metadata as Record<string, unknown> | undefined;
        const phoneNumberId = String(
          metadata?.phone_number_id ?? entryData.id ?? ""
        );

        // Process messages
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];

        for (const msg of messages) {
          const messageData = msg as Record<string, unknown>;
          const parsed = this.parseMessage(
            phoneNumberId,
            messageData,
            contacts,
            data
          );
          if (parsed) {
            events.push(parsed);
          }
        }

        // Process statuses
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];

        for (const status of statuses) {
          const statusData = status as Record<string, unknown>;
          const parsed = this.parseStatus(phoneNumberId, statusData, data);
          if (parsed) {
            events.push(parsed);
          }
        }
      }
    }

    return events;
  }

  private parseMessage(
    phoneNumberId: string,
    message: Record<string, unknown>,
    contacts: unknown[],
    rawPayload: Record<string, unknown>
  ): WebhookEvent | null {
    const messageId = String(message.id ?? "");
    const from = String(message.from ?? "");
    const timestamp = Number(message.timestamp ?? Date.now() / 1000) * 1000;
    const type = String(message.type ?? "text");

    // Get contact name if available
    const contact = contacts.find((c) => {
      const contactData = c as Record<string, unknown>;
      return contactData.wa_id === from;
    }) as Record<string, unknown> | undefined;

    const profile = contact?.profile as Record<string, unknown> | undefined;
    const senderName = String(profile?.name ?? "");

    let text = "";
    const attachments: MessageAttachment[] = [];

    switch (type) {
      case "text": {
        const textData = message.text as Record<string, unknown> | undefined;
        text = String(textData?.body ?? "");
        break;
      }
      case "image": {
        const imageData = message.image as Record<string, unknown> | undefined;
        text = String(imageData?.caption ?? "");
        if (imageData?.id) {
          attachments.push({
            type: "image",
            url: String(imageData.id), // This is a media ID, needs to be fetched
            mimeType: String(imageData.mime_type ?? "image/jpeg"),
          });
        }
        break;
      }
      case "video": {
        const videoData = message.video as Record<string, unknown> | undefined;
        text = String(videoData?.caption ?? "");
        if (videoData?.id) {
          attachments.push({
            type: "video",
            url: String(videoData.id),
            mimeType: String(videoData.mime_type ?? "video/mp4"),
          });
        }
        break;
      }
      case "audio": {
        const audioData = message.audio as Record<string, unknown> | undefined;
        if (audioData?.id) {
          attachments.push({
            type: "audio",
            url: String(audioData.id),
            mimeType: String(audioData.mime_type ?? "audio/ogg"),
          });
        }
        break;
      }
      case "document": {
        const docData = message.document as Record<string, unknown> | undefined;
        text = String(docData?.caption ?? "");
        if (docData?.id) {
          attachments.push({
            type: "file",
            url: String(docData.id),
            filename: String(docData.filename ?? "document"),
            mimeType: String(docData.mime_type ?? "application/octet-stream"),
          });
        }
        break;
      }
      case "button": {
        const buttonData = message.button as Record<string, unknown> | undefined;
        text = String(buttonData?.text ?? "");
        break;
      }
      case "interactive": {
        const interactive = message.interactive as Record<string, unknown> | undefined;
        const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined;
        const listReply = interactive?.list_reply as Record<string, unknown> | undefined;
        text = String(buttonReply?.title ?? listReply?.title ?? "");
        break;
      }
    }

    const incomingMessage: IncomingMessage = {
      id: messageId,
      platform: this.platform,
      senderId: from,
      senderName: senderName || undefined,
      recipientId: phoneNumberId,
      threadId: `${this.platform}:${from}`,
      type: attachments.length > 0 ? attachments[0]!.type : "text",
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: new Date(timestamp),
      rawPayload,
    };

    return {
      eventId: this.generateEventId([
        this.platform,
        phoneNumberId,
        "message",
        messageId,
      ]),
      platform: this.platform,
      eventType: "message",
      accountId: phoneNumberId,
      message: incomingMessage,
      rawPayload,
      receivedAt: new Date(),
    };
  }

  private parseStatus(
    phoneNumberId: string,
    status: Record<string, unknown>,
    rawPayload: Record<string, unknown>
  ): WebhookEvent | null {
    const statusValue = String(status.status ?? "");
    const messageId = String(status.id ?? "");

    let eventType: WebhookEventType = "unknown";

    switch (statusValue) {
      case "sent":
        eventType = "message_delivered";
        break;
      case "delivered":
        eventType = "message_delivered";
        break;
      case "read":
        eventType = "message_read";
        break;
      default:
        return null;
    }

    return {
      eventId: this.generateEventId([
        this.platform,
        phoneNumberId,
        eventType,
        messageId,
        statusValue,
      ]),
      platform: this.platform,
      eventType,
      accountId: phoneNumberId,
      rawPayload,
      receivedAt: new Date(),
    };
  }

  /**
   * Download media from WhatsApp
   */
  async downloadMedia(
    connection: PlatformConnection,
    mediaId: string
  ): Promise<{ url: string; buffer?: Buffer; mimeType?: string } | null> {
    try {
      // Get media URL
      const mediaInfo = await this.graphGet<{ url?: string; mime_type?: string }>(
        `/${mediaId}`,
        connection.accessToken
      );

      if (!mediaInfo.url) {
        return null;
      }

      // Download the media
      const res = await fetch(mediaInfo.url, {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to download media: ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        url: mediaInfo.url,
        buffer,
        mimeType: mediaInfo.mime_type,
      };
    } catch (err) {
      this.logError("downloadMedia", err);
      return null;
    }
  }
}
