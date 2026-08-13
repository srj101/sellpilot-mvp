/**
 * SSLCommerz is the payment aggregator for the Bangladesh market — a single
 * integration surfaces bKash, Nagad, and card rails to the customer. Cash on
 * Delivery does not go through this at all (see router/checkout.ts).
 * https://developer.sslcommerz.com/doc/v4/
 *
 * Store credentials are ALWAYS passed in explicitly, never read from process.env here — two
 * completely separate merchant accounts use this module: each business's own store
 * (customer order checkout, credentials on businessProfile) and the SellPilot platform's own
 * store (SaaS billing, credentials on platformSettings, superadmin-managed). Mixing those up
 * would route a business's customer payments into the platform's own account. Callers that
 * want the platform's credentials (with an env-var fallback until a superadmin sets the DB
 * row) use resolvePlatformCredentials below instead of reading process.env themselves.
 *
 * Sandbox vs. live is the ONE exception — that stays a single SSLCOMMERZ_IS_SANDBOX env var
 * (deploy-time), not part of either credential set, so it's never something a superadmin or
 * business owner can flip via a settings UI on a production deploy.
 */
import { eq } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { platformSettings } from "@acme/db/schema";
import { env } from "@acme/env";

export interface SslcommerzCredentials {
  storeId: string;
  storePassword: string;
}

function isSandbox() {
  return env.SSLCOMMERZ_IS_SANDBOX;
}

function baseUrl() {
  return isSandbox() ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
}

export function hasCredentials(
  creds: Partial<SslcommerzCredentials> | null | undefined,
): creds is SslcommerzCredentials {
  return Boolean(creds?.storeId && creds.storePassword);
}

/** The SellPilot PLATFORM's own SSLCommerz credentials — for SaaS billing only, never a
 * business's customer checkout (see the header comment above). Superadmin-configured DB row
 * wins; falls back to the env vars so nothing breaks before that panel is used. Shared by
 * subscription.ts (router) and subscription-renewal.ts (worker) — the two places that
 * actually charge a business owner for their SellPilot plan. */
export async function resolvePlatformCredentials(db: typeof Db): Promise<SslcommerzCredentials> {
  const [row] = await db.select().from(platformSettings).limit(1);
  const creds = {
    storeId: row?.sslcommerzStoreId ?? env.SSLCOMMERZ_STORE_ID,
    storePassword: row?.sslcommerzStorePassword ?? env.SSLCOMMERZ_STORE_PASSWORD,
  };
  if (!hasCredentials(creds)) {
    throw new Error("SellPilot's payment gateway isn't configured yet — contact support.");
  }
  return creds;
}

/**
 * Card + bank rails only, for SaaS billing (subscription.subscribe). Deliberately excludes
 * `mobilebank`/`bkash`/`nagad` — see billing plan D5. Customer order checkout omits
 * `restrictedGateways` entirely instead of using this list, keeping every rail open.
 */
export const CARD_AND_BANK_GATEWAYS = ["visacard", "mastercard", "amexcard", "internetbank"];

export interface InitiatePaymentInput {
  credentials: SslcommerzCredentials;
  transactionId: string;
  /** Whole taka, not paisa */
  amount: number;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  productName: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  /**
   * SSLCommerz gateway names to restrict the hosted checkout page to (→ `multi_card_name`).
   * Omit entirely for customer order checkout, which must keep every rail open (bKash,
   * Nagad, card, bank) since the AI agent already promises all of them in chat. SaaS
   * billing (subscription.subscribe) passes card + bank gateway names here so bKash/Nagad
   * never appear on that checkout — see billing plan D5.
   */
  restrictedGateways?: string[];
}

export type InitiatePaymentResult =
  | { ok: true; gatewayUrl: string; sessionKey: string }
  | { ok: false; reason: string };

export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  const { storeId, storePassword } = input.credentials;

  const body = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: input.amount.toString(),
    currency: "BDT",
    tran_id: input.transactionId,
    success_url: input.successUrl,
    fail_url: input.failUrl,
    cancel_url: input.cancelUrl,
    ipn_url: input.ipnUrl,
    cus_name: input.customerName,
    // SSLCommerz requires an email; chat customers rarely give one.
    cus_email: "no-reply@sellpilot.ai",
    cus_add1: input.customerAddress ?? "N/A",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: input.customerPhone,
    shipping_method: "NO",
    product_name: input.productName,
    product_category: "General",
    product_profile: "general",
    num_of_item: "1",
    ...(input.restrictedGateways?.length ? { multi_card_name: input.restrictedGateways.join(",") } : {}),
  });

  const res = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    return { ok: false, reason: `SSLCommerz init request failed (HTTP ${res.status})` };
  }

  const data = (await res.json()) as {
    status?: string;
    GatewayPageURL?: string;
    sessionkey?: string;
    failedreason?: string;
  };

  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    return { ok: false, reason: data.failedreason ?? "SSLCommerz did not return a gateway URL." };
  }

  return { ok: true, gatewayUrl: data.GatewayPageURL, sessionKey: data.sessionkey ?? "" };
}

export type GatewayProbeResult =
  | { ok: true; bkash: boolean; nagad: boolean; card: boolean; internetBanking: boolean }
  | { ok: false; reason: string };

/**
 * Probes which payment rails are actually active on this business's own SSLCommerz store,
 * for the per-method connection status the Payments page shows (spec FR-PAY-01). SSLCommerz
 * has no dedicated "check enabled gateways" endpoint — this reuses the Create Session call
 * (same endpoint as initiatePayment) since its response already lists every active gateway
 * in `desc`/`gw`, and just never redirects anyone to the resulting GatewayPageURL. The
 * `SPVERIFY-` tran_id prefix keeps this identifiable (and harmless — it will never match a
 * real order.paymentToken) if a business owner ever spots it in their SSLCommerz dashboard.
 */
export async function probeActiveGateways(
  credentials: SslcommerzCredentials,
  businessId: string,
): Promise<GatewayProbeResult> {
  const { storeId, storePassword } = credentials;
  const appUrl = env.APP_URL;
  const base = `${appUrl}/api/payments/sslcommerz`;

  const body = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: "10",
    currency: "BDT",
    tran_id: `SPVERIFY-${businessId}-${Date.now()}`,
    success_url: `${base}/success`,
    fail_url: `${base}/fail`,
    cancel_url: `${base}/cancel`,
    ipn_url: `${base}/ipn`,
    cus_name: "SellPilot Verification",
    cus_email: "no-reply@sellpilot.ai",
    cus_add1: "N/A",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: "0000000000",
    shipping_method: "NO",
    product_name: "Gateway verification",
    product_category: "General",
    product_profile: "general",
    num_of_item: "1",
  });

  const res = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    return { ok: false, reason: `SSLCommerz init request failed (HTTP ${res.status})` };
  }

  const data = (await res.json()) as {
    status?: string;
    failedreason?: string;
    desc?: { name?: string; type?: string }[];
  };

  if (data.status !== "SUCCESS") {
    return { ok: false, reason: data.failedreason ?? "SSLCommerz rejected the credentials." };
  }

  const desc = data.desc ?? [];
  const has = (pred: (entry: { name?: string; type?: string }) => boolean) => desc.some(pred);

  return {
    ok: true,
    bkash: has((d) => (d.name ?? "").toLowerCase().includes("bkash")),
    nagad: has((d) => (d.name ?? "").toLowerCase().includes("nagad")),
    card: has((d) => ["visa", "master", "amex", "othercards"].includes((d.type ?? "").toLowerCase())),
    internetBanking: has((d) => (d.type ?? "").toLowerCase() === "internetbanking"),
  };
}

export interface ValidatePaymentResult {
  valid: boolean;
  transactionId?: string;
  amount?: number;
  /** "bkash" | "nagad" | "card" | "internetbank" | "other" — the real rail, see billing plan D8 */
  method?: string;
  /** Best-effort, from the validator's masked card_no (e.g. "424242XXXXXX4242") when
   * present — not guaranteed on every response/method, callers should fall back
   * gracefully (e.g. to "0000") rather than treat this as always available. */
  last4?: string;
}

/**
 * Normalizes SSLCommerz's own gateway identifier (the validator API's `card_type` /
 * `card_issuer` field, same vocabulary as the `gw` values in initiatePayment's response —
 * e.g. "bkash", "Visa-Dutch Bangla Bank", "IBBL") into our fixed method vocabulary. Without
 * this, every online payment collapses into one undifferentiated "sslcommerz" bucket and
 * the bKash/Nagad/Card breakdown the Payments page needs (spec §5.2) is unrenderable.
 */
function normalizeMethod(rawCardType: string | undefined): string {
  if (!rawCardType) return "card";
  const v = rawCardType.toLowerCase();
  if (v.includes("bkash")) return "bkash";
  if (v.includes("nagad")) return "nagad";
  if (v.includes("visa") || v.includes("master") || v.includes("amex") || v.includes("card")) return "card";
  return "internetbank";
}

/** Called from checkout.markOrderPaid to verify a payment server-to-server before trusting it. */
export async function validatePayment(valId: string, credentials: SslcommerzCredentials): Promise<ValidatePaymentResult> {
  const { storeId, storePassword } = credentials;

  const params = new URLSearchParams({
    val_id: valId,
    store_id: storeId,
    store_passwd: storePassword,
    format: "json",
  });

  const res = await fetch(`${baseUrl()}/validator/api/validationserverAPI.php?${params.toString()}`);
  if (!res.ok) return { valid: false };

  const data = (await res.json()) as {
    status?: string;
    tran_id?: string;
    amount?: string;
    card_type?: string;
    card_issuer?: string;
    card_no?: string;
  };
  const valid = data.status === "VALID" || data.status === "VALIDATED";
  // Best-effort — SSLCommerz's validator returns a masked card_no (e.g.
  // "424242XXXXXX4242") for card transactions; not documented as guaranteed on every
  // response/method, so this stays optional rather than something callers can rely on.
  const cardDigits = data.card_no?.replace(/\D/g, "");
  const last4 = cardDigits && cardDigits.length >= 4 ? cardDigits.slice(-4) : undefined;
  return {
    valid,
    transactionId: data.tran_id,
    amount: data.amount ? Number(data.amount) : undefined,
    method: normalizeMethod(data.card_type ?? data.card_issuer),
    last4,
  };
}
