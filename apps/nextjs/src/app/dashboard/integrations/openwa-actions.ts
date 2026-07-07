"use server";

import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import {
  createSession,
  startSession,
  getQrCode,
  getSessionStatus,
  deleteSession,
  registerOpenWAWebhook,
} from "~/lib/openwa";
import { env } from "~/env";

/**
 * Derive a deterministic OpenWA session name from the user id.
 */
function sessionName(userId: string) {
  return `user-${userId}`;
}

/**
 * Create and start an OpenWA session, then return the session id.
 */
export async function startOpenWASession(): Promise<
  { ok: true; sessionId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const name = sessionName(session.user.id);

  try {
    // Try to create the session — it may already exist (409)
    try {
      await createSession(name);
    } catch (err: any) {
      // 409 Conflict = session already exists — that's fine
      if (!err.message?.includes("409") && !err.message?.includes("already exists")) {
        throw err;
      }
    }

    // Start the session engine
    try {
      const started = await startSession(name);
      return { ok: true, sessionId: started.id };
    } catch (err: any) {
      // If already running, just get the session id
      if (err.message?.includes("400") || err.message?.includes("already")) {
        const s = await getSessionStatus(name);
        return { ok: true, sessionId: s.id };
      }
      throw err;
    }
  } catch (err) {
    console.error("[OpenWA] startOpenWASession error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Poll the QR code for a session.
 */
export async function fetchOpenWAQr(): Promise<
  | { ok: true; qrCode: string | null; status: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const name = sessionName(session.user.id);

  try {
    const qr = await getQrCode(name);
    return { ok: true, qrCode: qr.qrCode, status: qr.status };
  } catch (err) {
    console.error("[OpenWA] fetchOpenWAQr error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "QR not available yet",
    };
  }
}

/**
 * Check current session state; if ready → save the connection.
 */
export async function checkOpenWAStatus(): Promise<
  | { ok: true; status: string; phone: string | null; pushName: string | null }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const name = sessionName(session.user.id);

  try {
    const s = await getSessionStatus(name);
    return { ok: true, status: s.status, phone: s.phone, pushName: s.pushName };
  } catch (err) {
    console.error("[OpenWA] checkOpenWAStatus error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown" };
  }
}

/**
 * Persist the ready OpenWA session as a whatsapp metaConnection row,
 * and register a webhook to receive messages.
 */
export async function saveOpenWAConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const name = sessionName(session.user.id);

  try {
    const s = await getSessionStatus(name);
    if (s.status !== "ready") {
      return { ok: false, error: "Session is not ready yet" };
    }

    const phone = s.phone ?? "unknown";
    const displayName = s.pushName ?? phone;

    // Upsert the connection
    const existing = await db.query.metaConnection.findFirst({
      where: and(
        eq(metaConnection.userId, session.user.id),
        eq(metaConnection.platform, "whatsapp"),
      ),
    });

    if (existing) {
      await db
        .update(metaConnection)
        .set({
          platformAccountId: phone,
          platformAccountName: displayName,
          accessToken: name, // "user-<userId>" — flags this as OpenWA
          whatsappAccessToken: "openwa",
          whatsappPhoneNumberId: phone,
          webhookSubscriptionStatus: "subscribed",
          webhookSubscribedAt: new Date(),
          metadata: { provider: "openwa", sessionId: s.id, phone },
        })
        .where(eq(metaConnection.id, existing.id));
    } else {
      await db.insert(metaConnection).values({
        userId: session.user.id,
        platform: "whatsapp",
        platformAccountId: phone,
        platformAccountName: displayName,
        accessToken: name,
        whatsappAccessToken: "openwa",
        whatsappPhoneNumberId: phone,
        webhookSubscriptionStatus: "subscribed",
        webhookSubscribedAt: new Date(),
        metadata: { provider: "openwa", sessionId: s.id, phone },
      });
    }

    // Register webhook on OpenWA so we receive messages
    const baseUrl =
      env.BETTER_AUTH_URL ??
      `http://localhost:3000`;
    const webhookUrl = `${baseUrl}/api/openwa/webhook`;
    const secret = env.META_WEBHOOK_VERIFY_TOKEN; // reuse existing secret

    try {
      await registerOpenWAWebhook(s.id, webhookUrl, secret);
    } catch (err) {
      console.warn("[OpenWA] Webhook registration failed (non-fatal):", err);
    }

    return { ok: true };
  } catch (err) {
    console.error("[OpenWA] saveOpenWAConnection error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Disconnect an OpenWA WhatsApp connection (stop session + delete DB row).
 */
export async function disconnectOpenWA(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const name = sessionName(session.user.id);

  try {
    // Stop the OpenWA session (best-effort)
    try {
      await deleteSession(name);
    } catch {
      // If the session doesn't exist in OpenWA, that's fine
    }

    // Remove the DB connection row
    await db
      .delete(metaConnection)
      .where(
        and(
          eq(metaConnection.userId, session.user.id),
          eq(metaConnection.platform, "whatsapp"),
        ),
      );

    return { ok: true };
  } catch (err) {
    console.error("[OpenWA] disconnectOpenWA error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
