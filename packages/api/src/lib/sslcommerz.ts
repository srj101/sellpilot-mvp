/**
 * SSLCommerz is the payment aggregator for the Bangladesh market — a single
 * integration surfaces bKash, Nagad, and card rails to the customer. Cash on
 * Delivery does not go through this at all (see router/checkout.ts).
 * https://developer.sslcommerz.com/doc/v4/
 *
 * Reads process.env directly (no zod validation layer here) since this package
 * is shared and doesn't own an app-level env schema — the Next.js app still
 * declares & validates these vars at boot via its own src/env.ts.
 */
function isSandbox() {
  return process.env.SSLCOMMERZ_IS_SANDBOX !== "false";
}

function baseUrl() {
  return isSandbox() ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
}

export function isSslcommerzConfigured() {
  return Boolean(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD);
}

export interface InitiatePaymentInput {
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
}

export type InitiatePaymentResult =
  | { ok: true; gatewayUrl: string; sessionKey: string }
  | { ok: false; reason: string };

export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  if (!storeId || !storePassword) {
    return { ok: false, reason: "SSLCommerz is not configured (missing SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD)." };
  }

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

export interface ValidatePaymentResult {
  valid: boolean;
  transactionId?: string;
  amount?: number;
}

/** Called from checkout.markOrderPaid to verify a payment server-to-server before trusting it. */
export async function validatePayment(valId: string): Promise<ValidatePaymentResult> {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  if (!storeId || !storePassword) return { valid: false };

  const params = new URLSearchParams({
    val_id: valId,
    store_id: storeId,
    store_passwd: storePassword,
    format: "json",
  });

  const res = await fetch(`${baseUrl()}/validator/api/validationserverAPI.php?${params.toString()}`);
  if (!res.ok) return { valid: false };

  const data = (await res.json()) as { status?: string; tran_id?: string; amount?: string };
  const valid = data.status === "VALID" || data.status === "VALIDATED";
  return {
    valid,
    transactionId: data.tran_id,
    amount: data.amount ? Number(data.amount) : undefined,
  };
}
