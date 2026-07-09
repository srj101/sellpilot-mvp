"use server";

import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import {
  createSession,
  deleteSession,
  getQrCode,
  getSessionStatus,
  listSessions,
  logoutSession,
  registerOpenWAWebhook,
  startSession,
  stopSession,
} from "~/lib/openwa";

/**
 * Derive a deterministic OpenWA session name from the user id.
 */
function sessionName(userId: string) {
  return `user-${userId}`;
}

async function cleanupExistingSession(name: string) {
  const sessions = await listSessions();
  const existingSessions = sessions.filter((session) => session.name === name);
  if (!existingSessions.length) return;

  for (const existing of existingSessions) {
    try {
      await logoutSession(existing.id);
    } catch (err) {
      console.warn(
        "[OpenWA] cleanupExistingSession logoutSession failed:",
        err,
      );
    }

    try {
      await stopSession(existing.id);
    } catch (err) {
      console.warn("[OpenWA] cleanupExistingSession stopSession failed:", err);
    }

    try {
      await deleteSession(existing.id);
    } catch (err) {
      console.warn(
        "[OpenWA] cleanupExistingSession deleteSession failed:",
        err,
      );
    }
  }
}

async function getOpenWASessionIdForUser(userId: string) {
  const connection = await db.query.metaConnection.findFirst({
    where: and(
      eq(metaConnection.userId, userId),
      eq(metaConnection.platform, "whatsapp"),
    ),
    columns: {
      metadata: true,
    },
  });

  if (!connection?.metadata || typeof connection.metadata !== "object") {
    return null;
  }

  const sessionId = (connection.metadata as any).sessionId;
  return typeof sessionId === "string" ? sessionId : null;
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
    // Clean up any stale existing session with this name before creating a fresh one.
    await cleanupExistingSession(name);

    const created = await createSession(name);
    const started = await startSession(created.id);
    return { ok: true, sessionId: started.id };
  } catch (err: any) {
    // If the session already exists and cannot be recreated, try using it anyway.
    if (
      err.message?.includes("409") ||
      err.message?.includes("already exists") ||
      err.message?.includes("already")
    ) {
      try {
        const s = await getSessionStatus(name);
        return { ok: true, sessionId: s.id };
      } catch (innerErr) {
        console.error("[OpenWA] startOpenWASession fallback failed:", innerErr);
      }
    }
    throw err;
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
    const baseUrl = env.BETTER_AUTH_URL ?? `http://localhost:3000`;
    const webhookUrl = `${baseUrl}/api/openwa/webhook`;
    const secret = env.OPENWA_WEBHOOK_SECRET ?? env.META_WEBHOOK_VERIFY_TOKEN;

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
  const storedSessionId = await getOpenWASessionIdForUser(session.user.id);

  console.log("[OpenWA] disconnectOpenWA called", {
    userId: session.user.id,
    name,
    storedSessionId,
  });

  try {
    // Prefer deleting the actual stored OpenWA UUID first.
    if (storedSessionId) {
      console.log("[OpenWA] disconnectOpenWA deleting stored sessionId", {
        storedSessionId,
      });
      try {
        await logoutSession(storedSessionId);
      } catch (err) {
        console.warn(
          "[OpenWA] logoutSession failed during disconnect (stored sessionId):",
          err,
        );
      }

      try {
        await stopSession(storedSessionId);
      } catch (err) {
        console.warn(
          "[OpenWA] stopSession failed during disconnect (stored sessionId):",
          err,
        );
      }

      try {
        await deleteSession(storedSessionId);
      } catch (err) {
        console.warn(
          "[OpenWA] deleteSession failed during disconnect (stored sessionId):",
          err,
        );
      }
    }

    // Also delete any session currently registered under the deterministic name.
    console.log("[OpenWA] disconnectOpenWA deleting sessions by name", {
      name,
    });
    try {
      const sessions = await listSessions();
      const namedSessions = sessions.filter((session) => session.name === name);
      for (const session of namedSessions) {
        try {
          await logoutSession(session.id);
        } catch (err) {
          console.warn(
            "[OpenWA] logoutSession failed during disconnect (named session):",
            err,
          );
        }

        try {
          await stopSession(session.id);
        } catch (err) {
          console.warn(
            "[OpenWA] stopSession failed during disconnect (named session):",
            err,
          );
        }

        try {
          await deleteSession(session.id);
        } catch (err) {
          console.warn(
            "[OpenWA] deleteSession failed during disconnect (named session):",
            err,
          );
        }
      }
    } catch (err) {
      console.warn("[OpenWA] delete by name cleanup failed:", err);
    }

    // Remove the DB connection row regardless of OpenWA outcome
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
