// Server-only — this module must not be imported from client components

/**
 * Meta Graph API helper functions.
 *
 * All functions run server-side only and use the Graph API version
 * from the FACEBOOK_GRAPH_VERSION environment variable (default: v25.0).
 *
 * Docs:
 * - Manual Login Flow: https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow
 * - Long-Lived Tokens: https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived
 * - Pages API: https://developers.facebook.com/docs/pages-api
 * - WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const FB_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";
const APP_ID = requireEnv("FACEBOOK_APP_ID");
const APP_SECRET = requireEnv("FACEBOOK_APP_SECRET");

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

export async function graphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${FB_VERSION}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(`Graph API ${res.status}: ${JSON.stringify(data)}`);
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// OAuth token exchange
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

/**
 * Exchange an authorization code for a short-lived access token.
 *
 * @see https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri?: string,
): Promise<TokenResponse> {
  const params: Record<string, string> = {
    client_id: APP_ID,
    client_secret: APP_SECRET,
    code,
  };

  if (redirectUri) {
    params.redirect_uri = redirectUri;
  }

  return graphGet<TokenResponse>("/oauth/access_token", params);
}

/**
 * Exchange a short-lived token for a long-lived token (~60 days).
 *
 * @see https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<TokenResponse> {
  try {
    return await graphGet<TokenResponse>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: shortLivedToken,
    });
  } catch {
    // If long-lived exchange fails, return original token info
    return {
      access_token: shortLivedToken,
      token_type: "bearer",
    };
  }
}

// ---------------------------------------------------------------------------
// Pages + Instagram
// ---------------------------------------------------------------------------

export interface InstagramBusinessAccount {
  id: string;
  username?: string;
  profile_picture_url?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  picture?: {
    data?: {
      url?: string;
    };
  };
  instagram_business_account?: InstagramBusinessAccount;
}

export interface PagesResponse {
  data: FacebookPage[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
}

/**
 * Fetch all Facebook Pages the user administers, including linked Instagram
 * Business/Creator accounts.
 *
 * @see https://developers.facebook.com/docs/pages-api
 */
export async function getPagesWithInstagram(
  userAccessToken: string,
  channel?: string,
): Promise<PagesResponse> {
  const response = await graphGet<PagesResponse>("/me/accounts", {
    access_token: userAccessToken,
    fields: [
      "id",
      "name",
      "access_token",
      "tasks",
      "picture",
      "instagram_business_account{id,username,profile_picture_url}",
    ].join(","),
  });

  if (channel === "facebook") {
    response.data = response.data.filter((page) =>
      page.tasks?.includes("MANAGE"),
    );
  } else if (channel === "instagram") {
    response.data = response.data.filter(
      (page) => page.instagram_business_account,
    );
  }

  return response;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export interface WhatsAppPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
}

export interface WhatsAppPhoneNumbersResponse {
  data: WhatsAppPhoneNumber[];
}

export interface WhatsAppBusinessAccount {
  id: string;
  name: string;
  primary_funding_id?: string;
  phone_numbers?: WhatsAppPhoneNumber[];
}

/**
 * Fetch phone numbers for a WhatsApp Business Account.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export async function getWhatsAppPhoneNumbers(
  wabaId: string,
  accessToken: string,
): Promise<WhatsAppPhoneNumbersResponse> {
  return graphGet<WhatsAppPhoneNumbersResponse>(`/${wabaId}/phone_numbers`, {
    access_token: accessToken,
  });
}



export async function getWhatsAppAccounts(
  userAccessToken: string,
): Promise<WhatsAppBusinessAccount[]> {
  try {
    const businessesResponse = await getWhatsAppBusinesses(userAccessToken);
    const businesses = businessesResponse.data || [];

    const accountsList: WhatsAppBusinessAccount[] = [];

    for (const business of businesses) {
      try {
        const wabaResponse = await graphGet<{ data: { id: string; name: string }[] }>(
          `/${business.id}/owned_whatsapp_business_accounts`,
          { access_token: userAccessToken },
        );
        const wabaAccounts = wabaResponse.data || [];

        for (const waba of wabaAccounts) {
          try {
            const phoneNumbersResponse = await getWhatsAppPhoneNumbers(
              waba.id,
              userAccessToken,
            );
            accountsList.push({
              id: waba.id,
              name: waba.name,
              phone_numbers: phoneNumbersResponse.data || [],
            });
          } catch (phoneErr) {
            console.error(`Failed to fetch phone numbers for WABA ${waba.id}:`, phoneErr);
            accountsList.push({
              id: waba.id,
              name: waba.name,
              phone_numbers: [],
            });
          }
        }
      } catch (wabaErr) {
        console.error(`Failed to fetch WABAs for business ${business.id}:`, wabaErr);
      }
    }

    return accountsList;
  } catch (err) {
    console.error("Failed to fetch WhatsApp accounts:", err);
    throw err;
  }
}

/**
 * Fetch the WhatsApp Business Accounts the user administers. Used by the
 * select page to render the WhatsApp channel picker.
 */
export async function getWhatsAppBusinesses(
  userAccessToken: string,
): Promise<{ data: WhatsAppBusinessAccount[] }> {
  return graphGet<{ data: WhatsAppBusinessAccount[] }>("/me/businesses", {
    access_token: userAccessToken,
    fields: "id,name,primary_funding_id",
    type: "whatsapp_business_management",
  });
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export interface MetaUserProfile {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

/**
 * Fetch the authenticated user's basic profile info.
 */
export async function getMetaProfile(
  accessToken: string,
): Promise<MetaUserProfile> {
  return graphGet<MetaUserProfile>("/me", {
    access_token: accessToken,
    fields: "id,name,email,picture",
  });
}

// ---------------------------------------------------------------------------
// Webhook subscription helpers
// ---------------------------------------------------------------------------

export interface MetaWebhookSubscriptionResponse {
  success: boolean;
}

const FACEBOOK_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_reads",
  "message_deliveries",
  "feed",
];

const INSTAGRAM_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_reads",
  "message_deliveries",
];

async function graphPost<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${FB_VERSION}${path}`);

  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(`Graph API ${res.status}: ${JSON.stringify(data)}`);
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }

  return data as T;
}

async function graphPostJson<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${FB_VERSION}${path}`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(`Graph API ${res.status}: ${JSON.stringify(data)}`);
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }

  return data as T;
}

export async function subscribeMetaPageWebhooks(
  pageId: string,
  accessToken: string,
  fields: string[] = FACEBOOK_WEBHOOK_FIELDS,
): Promise<MetaWebhookSubscriptionResponse> {
  return graphPost<MetaWebhookSubscriptionResponse>(
    `/${pageId}/subscribed_apps`,
    {
      access_token: accessToken,
      subscribed_fields: fields.join(","),
    },
  );
}

export async function subscribeInstagramWebhooks(
  pageId: string,
  accessToken: string,
  fields: string[] = INSTAGRAM_WEBHOOK_FIELDS,
): Promise<MetaWebhookSubscriptionResponse> {
  return graphPost<MetaWebhookSubscriptionResponse>(
    `/${pageId}/subscribed_apps`,
    {
      access_token: accessToken,
      subscribed_fields: fields.join(","),
    },
  );
}

export async function subscribeWhatsAppWebhooks(
  wabaId: string,
  accessToken: string,
): Promise<MetaWebhookSubscriptionResponse> {
  return graphPost<MetaWebhookSubscriptionResponse>(
    `/${wabaId}/subscribed_apps`,
    {
      access_token: accessToken,
    },
  );
}

export type MetaInboxPlatform = "facebook_page" | "instagram" | "whatsapp";

export interface SendMetaInboxReplyInput {
  platform: MetaInboxPlatform;
  accessToken: string;
  accountId: string;
  recipientId: string;
  text: string;
  imageUrl?: string;
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  console.log(`[sendMetaInboxReply] Downloading image from URL: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { buffer, contentType };
}

export async function sendMetaInboxReply({
  platform,
  accessToken,
  accountId,
  recipientId,
  text,
  imageUrl,
}: SendMetaInboxReplyInput): Promise<{ messageId?: string; raw: unknown }> {
  console.log("[sendMetaInboxReply] Parameters:", {
    platform,
    accountId,
    recipientId,
    imageUrl,
    accessToken: accessToken ? `${accessToken.slice(0, 15)}...` : "missing",
  });

  if (platform === "whatsapp") {
    if (accessToken.startsWith("user-")) {
      if (imageUrl) {
        try {
          const { buffer, contentType } = await downloadImage(imageUrl);
          const base64Data = buffer.toString("base64");
          const dataUrl = `data:${contentType};base64,${base64Data}`;
          const { sendOpenWAImage } = await import("./openwa");
          const response = await sendOpenWAImage(accessToken, recipientId, dataUrl, text);
          return {
            messageId: response.messageId,
            raw: response,
          };
        } catch (downloadErr) {
          console.error("[sendMetaInboxReply] Failed OpenWA image download, falling back to URL sending:", downloadErr);
          const { sendOpenWAImage } = await import("./openwa");
          const response = await sendOpenWAImage(accessToken, recipientId, imageUrl, text);
          return {
            messageId: response.messageId,
            raw: response,
          };
        }
      } else {
        const { sendOpenWAText } = await import("./openwa");
        const response = await sendOpenWAText(accessToken, recipientId, text);
        return {
          messageId: response.messageId,
          raw: response,
        };
      }
    }

    if (imageUrl) {
      try {
        const { buffer, contentType } = await downloadImage(imageUrl);
        
        // Step 1: Upload media to WhatsApp media endpoint to get a media ID
        const uploadForm = new FormData();
        uploadForm.append("messaging_product", "whatsapp");
        const uploadBlob = new Blob([new Uint8Array(buffer)], { type: contentType });
        uploadForm.append("file", uploadBlob, "image.jpg");

        const uploadRes = await fetch(
          `https://graph.facebook.com/${FB_VERSION}/${accountId}/media`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: uploadForm,
          }
        );

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`WhatsApp media upload failed: ${uploadRes.status} ${errText}`);
        }

        const uploadData = (await uploadRes.json()) as { id: string };
        const mediaId = uploadData.id;

        // Step 2: Send message referencing the media ID
        const response = await graphPostJson<any>(
          `/${accountId}/messages`,
          accessToken,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientId,
            type: "image",
            image: {
              id: mediaId,
              caption: text || undefined,
            },
          },
        );

        return {
          messageId:
            typeof response.messages?.[0]?.id === "string"
              ? response.messages[0].id
              : undefined,
          raw: response,
        };
      } catch (err: any) {
        console.error("[sendMetaInboxReply] WhatsApp media upload failed, falling back to link:", err);
        // Fallback to sending standard link
        const response = await graphPostJson<any>(
          `/${accountId}/messages`,
          accessToken,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientId,
            type: "image",
            image: {
              link: imageUrl,
              caption: text || undefined,
            },
          },
        );
        return {
          messageId:
            typeof response.messages?.[0]?.id === "string"
              ? response.messages[0].id
              : undefined,
          raw: response,
        };
      }
    }

    const response = await graphPostJson<any>(
      `/${accountId}/messages`,
      accessToken,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "text",
        text: {
          body: text,
        },
      },
    );

    return {
      messageId:
        typeof response.messages?.[0]?.id === "string"
          ? response.messages[0].id
          : undefined,
      raw: response,
    };
  }

  // Messenger / Instagram
  if (imageUrl) {
    try {
      const { buffer, contentType } = await downloadImage(imageUrl);

      const formData = new FormData();
      formData.append("recipient", JSON.stringify({ id: recipientId }));
      formData.append(
        "message",
        JSON.stringify({
          attachment: {
            type: "image",
            payload: {
              is_reusable: true,
            },
          },
        })
      );
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
      formData.append("filedata", blob, "image.jpg");

      const res = await fetch(
        `https://graph.facebook.com/${FB_VERSION}/${accountId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      const response = (await res.json()) as any;

      if (!res.ok) {
        throw new Error(`Meta multipart send failed ${res.status}: ${JSON.stringify(response)}`);
      }

      // Then send text if any
      if (text) {
        try {
          await graphPostJson<any>(
            `/${accountId}/messages`,
            accessToken,
            {
              recipient: {
                id: recipientId,
              },
              messaging_type: "RESPONSE",
              message: {
                text,
              },
            },
          );
        } catch (err) {
          console.error("[sendMetaInboxReply] Failed to send follow up text after image:", err);
        }
      }

      return {
        messageId:
          typeof response.message_id === "string"
            ? response.message_id
            : typeof response.messages?.[0]?.id === "string"
              ? response.messages[0].id
              : undefined,
        raw: response,
      };
    } catch (err: any) {
      console.error("[sendMetaInboxReply] Meta multipart send failed, falling back to link:", err);
      // Fallback to URL link sending
      const response = await graphPostJson<any>(
        `/${accountId}/messages`,
        accessToken,
        {
          recipient: {
            id: recipientId,
          },
          messaging_type: "RESPONSE",
          message: {
            attachment: {
              type: "image",
              payload: {
                url: imageUrl,
                is_reusable: true,
              },
            },
          },
        },
      );

      if (text) {
        try {
          await graphPostJson<any>(
            `/${accountId}/messages`,
            accessToken,
            {
              recipient: {
                id: recipientId,
              },
              messaging_type: "RESPONSE",
              message: {
                text,
              },
            },
          );
        } catch (sendErr) {
          console.error("[sendMetaInboxReply] Failed to send follow up text after image link:", sendErr);
        }
      }

      return {
        messageId:
          typeof response.message_id === "string"
            ? response.message_id
            : typeof response.messages?.[0]?.id === "string"
              ? response.messages[0].id
              : undefined,
        raw: response,
      };
    }
  }

  const response = await graphPostJson<any>(
    `/${accountId}/messages`,
    accessToken,
    {
      recipient: {
        id: recipientId,
      },
      messaging_type: "RESPONSE",
      message: {
        text,
      },
    },
  );

  return {
    messageId:
      typeof response.message_id === "string"
        ? response.message_id
        : typeof response.messages?.[0]?.id === "string"
          ? response.messages[0].id
          : undefined,
    raw: response,
  };
}

export async function getWhatsAppMediaUrl(
  mediaId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const data = await graphGet<{ url?: string }>(`/${mediaId}`, {
      access_token: accessToken,
    });
    return data.url ?? null;
  } catch (error) {
    console.error("[Meta] Failed to get WhatsApp media URL:", error);
    return null;
  }
}
