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
    const error = new Error(
      `Graph API ${res.status}: ${JSON.stringify(data)}`,
    );
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
  redirectUri: string,
): Promise<TokenResponse> {
  return graphGet<TokenResponse>("/oauth/access_token", {
    client_id: APP_ID,
    client_secret: APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });
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
): Promise<PagesResponse> {
  return graphGet<PagesResponse>("/me/accounts", {
    access_token: userAccessToken,
    fields: [
      "id",
      "name",
      "access_token",
      "tasks",
      "instagram_business_account{id,username,profile_picture_url}",
    ].join(","),
  });
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
