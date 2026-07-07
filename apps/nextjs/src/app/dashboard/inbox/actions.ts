"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { sendMetaInboxReply } from "~/lib/meta";

export async function sendInboxReply(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const threadId = String(formData.get("threadId") ?? "");
  const platform = String(formData.get("platform") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const recipientId = String(formData.get("recipientId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const channel = String(formData.get("channel") ?? "all");

  if (!threadId || !platform || !accountId || !recipientId || !message) {
    redirect(
      `/dashboard/inbox?thread=${encodeURIComponent(threadId)}&channel=${encodeURIComponent(channel)}`,
    );
  }

  const connections = await db
    .select()
    .from(metaConnection)
    .where(
      and(
        eq(metaConnection.userId, session.user.id),
        eq(
          metaConnection.platform,
          platform as "facebook_page" | "instagram" | "whatsapp",
        ),
      ),
    )
    .limit(1);

  const connection = connections[0];
  if (!connection) {
    redirect(
      `/dashboard/inbox?thread=${encodeURIComponent(threadId)}&channel=${encodeURIComponent(channel)}`,
    );
  }

  const accessToken =
    connection.accessToken ??
    connection.facebookPageAccessToken ??
    connection.whatsappAccessToken;

  if (!accessToken) {
    redirect(
      `/dashboard/inbox?thread=${encodeURIComponent(threadId)}&channel=${encodeURIComponent(channel)}`,
    );
  }

  const sent = await sendMetaInboxReply({
    platform: platform as "facebook_page" | "instagram" | "whatsapp",
    accessToken,
    accountId:
      platform === "instagram"
        ? (connection.facebookPageId ?? accountId)
        : accountId,
    recipientId,
    text: message,
  });

  await db.insert(metaWebhookEvent).values({
    dedupeKey: `outbound:${threadId}:${Date.now()}:${crypto.randomUUID()}`,
    platform: platform as "facebook_page" | "instagram" | "whatsapp",
    object:
      platform === "whatsapp"
        ? "whatsapp_business_account"
        : platform === "instagram"
          ? "instagram"
          : "page",
    eventType: "outbound",
    metaConnectionId: connection.id,
    userId: session.user.id,
    platformAccountId: accountId,
    sourceId: sent.messageId ?? null,
    rawPayload: {
      direction: "outbound",
      threadKey: threadId,
      recipientId,
      accountId,
      platform,
      text: message,
      response: sent.raw,
    },
    headers: {},
    status: "sent",
    processedAt: new Date(),
  });

  revalidatePath("/dashboard/inbox");
  redirect(
    `/dashboard/inbox?thread=${encodeURIComponent(threadId)}&channel=${encodeURIComponent(channel)}`,
  );
}
