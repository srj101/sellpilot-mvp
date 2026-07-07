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

const FB_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";
const APP_ID = process.env.FACEBOOK_APP_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

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
  const businessesResponse = await getWhatsAppBusinesses(userAccessToken);
  const businesses = businessesResponse.data || [];

  const accounts = await Promise.all(
    businesses.map(async (business) => {
      const phoneNumbersResponse = await getWhatsAppPhoneNumbers(
        business.id,
        userAccessToken,
      );
      return {
        ...business,
        phone_numbers: phoneNumbersResponse.data || [],
      };
    }),
  );

  return accounts;
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

export async function subscribeWhatsAppWebhooks(): Promise<MetaWebhookSubscriptionResponse> {
  return { success: true };
}

export type MetaInboxPlatform = "facebook_page" | "instagram" | "whatsapp";

export interface SendMetaInboxReplyInput {
  platform: MetaInboxPlatform;
  accessToken: string;
  accountId: string;
  recipientId: string;
  text: string;
}

export async function sendMetaInboxReply({
  platform,
  accessToken,
  accountId,
  recipientId,
  text,
}: SendMetaInboxReplyInput): Promise<{ messageId?: string; raw: unknown }> {
  console.log("[sendMetaInboxReply] Parameters:", {
    platform,
    accountId,
    recipientId,
    accessToken: accessToken ? `${accessToken.slice(0, 15)}...` : "missing",
  });

  if (platform === "whatsapp") {
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
