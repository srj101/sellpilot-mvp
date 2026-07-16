const OPENWA_URL = process.env.OPENWA_URL ?? "http://localhost:2785";
const API_KEY =
  process.env.OPENWA_API_KEY ??
  "owa_k1_302b9cd435a44a92c4c119023b123a586d1f29e9c94572e2ce20e5048e975ec063";

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Ensure the base URL does not have a trailing slash, and endpoint starts with a slash
  const baseUrl = OPENWA_URL.endsWith("/")
    ? OPENWA_URL.slice(0, -1)
    : OPENWA_URL;
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  const res = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[OpenWA API Error] ${res.status}: ${errorText}`);
    throw new Error(errorText || `API error ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export interface OpenWASession {
  id: string;
  name: string;
  status:
  | "created"
  | "initializing"
  | "qr_ready"
  | "authenticating"
  | "ready"
  | "disconnected"
  | "failed";
  phone: string | null;
  pushName: string | null;
  lastError: string | null;
}

/**
 * List all sessions registered in OpenWA
 */
export async function listSessions(): Promise<OpenWASession[]> {
  try {
    return await apiCall<OpenWASession[]>("/sessions");
  } catch (err) {
    console.error("[OpenWA] Failed to list sessions:", err);
    return [];
  }
}

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/**
 * Resolve friendly session name (like 'user-xxxx') or uuid to the active session uuid.
 */
export async function resolveSessionId(
  idOrName: string,
  opts?: { createIfMissing?: boolean },
): Promise<string> {
  const optsWithDefault = opts
    ? { createIfMissing: true, ...opts }
    : { createIfMissing: true };

  if (isUuid(idOrName)) {
    return idOrName;
  }

  const sessions = await listSessions();
  const found = sessions.find((s) => s.name === idOrName);
  if (found) {
    return found.id;
  }

  if (optsWithDefault.createIfMissing === false) {
    throw new Error(`Session not found: ${idOrName}`);
  }

  const created = await createSession(idOrName);
  return created.id;
}

/**
 * Register a new session
 */
export async function createSession(name: string): Promise<OpenWASession> {
  return apiCall<OpenWASession>("/sessions", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/**
 * Start the WhatsApp engine for a session
 */
export async function startSession(sessionId: string): Promise<OpenWASession> {
  const uuid = await resolveSessionId(sessionId);
  return apiCall<OpenWASession>(`/sessions/${uuid}/start`, {
    method: "POST",
  });
}

/**
 * Stop the session engine
 */
export async function stopSession(
  sessionId: string,
): Promise<{ success: boolean }> {
  const uuid = await resolveSessionId(sessionId, { createIfMissing: false });
  return apiCall<{ success: boolean }>(`/sessions/${uuid}/stop`, {
    method: "POST",
  });
}

/**
 * Fetch the active QR code as a PNG data URL.
 * Returns null if the engine is still initializing/booting.
 */
export async function getQrCode(
  sessionId: string,
): Promise<{ qrCode: string | null; status: string }> {
  const uuid = await resolveSessionId(sessionId);
  const baseUrl = OPENWA_URL.endsWith("/")
    ? OPENWA_URL.slice(0, -1)
    : OPENWA_URL;

  const res = await fetch(`${baseUrl}/api/sessions/${uuid}/qr`, {
    headers: {
      "X-API-Key": API_KEY,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");

    if (res.status === 400) {
      try {
        const data = JSON.parse(errorText) as { message?: string };
        if (data.message?.includes("not ready")) {
          return { qrCode: null, status: "initializing" };
        }
        if (
          data.message?.includes("not active") ||
          data.message?.includes("Start the session")
        ) {
          return { qrCode: null, status: "disconnected" };
        }
      } catch {
        // errorText wasn't valid JSON — fall through to the generic error below.
      }
    }

    console.error(`[OpenWA API Error] ${res.status}: ${errorText}`);
    return { qrCode: null, status: "disconnected" };
  }

  return res.json() as Promise<{ qrCode: string; status: string }>;
}

/**
 * Retrieve session details and connection status
 */
export async function getSessionStatus(
  sessionId: string,
): Promise<OpenWASession> {
  try {
    const uuid = await resolveSessionId(sessionId);
    return await apiCall<OpenWASession>(`/sessions/${uuid}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[OpenWA] Failed to get session status for ${sessionId}:`, message);

    if (
      message.includes("not active") ||
      message.includes("Start the session") ||
      message.includes("400") ||
      message.includes("API error 400")
    ) {
      return {
        id: sessionId,
        name: sessionId,
        status: "disconnected",
        phone: null,
        pushName: null,
        lastError: message || "Disconnected",
      };
    }

    throw err;
  }
}

/**
 * Delete a session permanently
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const uuid = await resolveSessionId(sessionId, { createIfMissing: false });
    await apiCall<void>(`/sessions/${uuid}`, {
      method: "DELETE",
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (
      message.includes("session not found") ||
      message.includes("404") ||
      message.includes("not found")
    ) {
      return;
    }
    throw err;
  }
}

/**
 * Logout the session from WhatsApp Web (clears saved credentials)
 */
export async function logoutSession(sessionId: string): Promise<void> {
  try {
    const uuid = await resolveSessionId(sessionId, { createIfMissing: false });
    const baseUrl = OPENWA_URL.endsWith("/")
      ? OPENWA_URL.slice(0, -1)
      : OPENWA_URL;

    const res = await fetch(`${baseUrl}/api/sessions/${uuid}/logout`, {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (res.ok || res.status === 204) {
      return;
    }

    const errorText = await res.text().catch(() => "");
    if (res.status === 404) {
      await apiCall<void>(`/sessions/${uuid}/stop`, { method: "POST" });
      return;
    }

    console.error(`[OpenWA API Error] ${res.status}: ${errorText}`);
    throw new Error(errorText || `API error ${res.status}`);
  } catch (err) {
    console.warn(
      "[OpenWA] Logout session request failed (possibly already logged out):",
      err,
    );
  }
}

/**
 * Send a WhatsApp text message
 * Recipient JID format: "<phone>@c.us"
 */
export async function sendOpenWAText(
  sessionId: string,
  to: string,
  text: string,
): Promise<{ messageId: string; timestamp: number }> {
  const uuid = await resolveSessionId(sessionId);
  // Ensure the JID format is correct
  const chatId = to.includes("@") ? to : `${to}@c.us`;
  console.log(`[OpenWA] sendOpenWAText -> session=${uuid} chatId=${chatId}`);
  const res = await apiCall<{ messageId: string; timestamp: number }>(
    `/sessions/${uuid}/messages/send-text`,
    {
      method: "POST",
      body: JSON.stringify({
        chatId,
        text,
      }),
    },
  );
  console.log(`[OpenWA] sendOpenWAText response ->`, res);
  return res;
}

/**
 * Send a WhatsApp image message
 * Recipient JID format: "<phone>@c.us"
 */
export async function sendOpenWAImage(
  sessionId: string,
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<{ messageId: string; timestamp: number }> {
  const uuid = await resolveSessionId(sessionId);
  const chatId = to.includes("@") ? to : `${to}@c.us`;
  console.log(
    `[OpenWA] sendOpenWAImage -> session=${uuid} chatId=${chatId} imageUrl=${imageUrl}`,
  );
  const res = await apiCall<{ messageId: string; timestamp: number }>(
    `/sessions/${uuid}/messages/send-image`,
    {
      method: "POST",
      body: JSON.stringify({
        chatId,
        file: imageUrl,
        filename: "image.jpg",
        caption: caption ?? "",
      }),
    },
  );
  console.log(`[OpenWA] sendOpenWAImage response ->`, res);
  return res;
}

/**
 * Subscribe a webhook URL to receive session events
 */
export async function registerOpenWAWebhook(
  sessionId: string,
  url: string,
  secret: string,
): Promise<{ id: string }> {
  const uuid = await resolveSessionId(sessionId);
  return apiCall<{ id: string }>(`/sessions/${uuid}/webhooks`, {
    method: "POST",
    body: JSON.stringify({
      url,
      events: ["message.received", "message.sent", "session.status"],
      secret,
      retryCount: 3,
    }),
  });
}
