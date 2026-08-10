import type { WooCommerceCredentials } from "./types";
import type { NormalizedProduct } from "./types";
import type { WooRawProduct, WooRawVariation } from "./normalize";
import { normalizeWooCommerceProduct } from "./normalize";

/**
 * WooCommerce REST API client (wc/v3).
 *
 * Docs notes (see research):
 * - WooCommerce removed the legacy consumer-key REST API from core — stores need the
 *   "WooCommerce Legacy REST API" plugin installed. `404 rest_no_route` means the
 *   plugin isn't there, so we surface that as a friendly message.
 * - Auth: HTTP Basic `base64(consumer_key:consumer_secret)`, with a query-string
 *   fallback (consumer_key/consumer_secret params) for hosts that strip the header.
 * - Pagination: `?per_page=100&page=N`; `X-WP-TotalPages` tells us when to stop.
 * - Product `variations` field is an ID array; the actual data needs a separate
 *   `GET /products/{id}/variations` call — only for `type === "variable"`.
 * - `404 rest_no_route` = Legacy REST API plugin not installed.
 */

export class WooCommerceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WooCommerceApiError";
  }
}

function normalizeStoreUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function apiUrl(credentials: WooCommerceCredentials, path: string): string {
  return `${normalizeStoreUrl(credentials.storeUrl)}/wp-json/wc/v3${path}`;
}

function authHeaders(credentials: WooCommerceCredentials): Record<string, string> {
  const basic = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString("base64");
  return { Authorization: `Basic ${basic}`, Accept: "application/json" };
}

/**
 * Query-string auth fallback. Some cheap hosting strips the Authorization header;
 * WooCommerce's legacy REST API also accepts credentials as query params.
 */
function authParams(credentials: WooCommerceCredentials): string {
  return `consumer_key=${encodeURIComponent(credentials.consumerKey)}&consumer_secret=${encodeURIComponent(credentials.consumerSecret)}`;
}

async function wooFetch<T>(
  credentials: WooCommerceCredentials,
  path: string,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {},
): Promise<{ json: T; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestUrl = apiUrl(credentials, path.includes("?") ? path : `${path}?${authParams(credentials)}`);
  let res: Response;
  try {
    res = await fetch(requestUrl, { signal: controller.signal, headers: authHeaders(credentials) });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new WooCommerceApiError(`WooCommerce request timed out after ${timeoutMs}ms.`, 408);
    }
    throw new WooCommerceApiError(`WooCommerce request failed: ${err instanceof Error ? err.message : String(err)}`, 0);
  }
  clearTimeout(timer);

  if (!res.ok) {
    // 404 with rest_no_route is the classic "Legacy REST API plugin not installed" signal.
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === "rest_no_route") {
        throw new WooCommerceApiError(
          "This WooCommerce store can't reach the REST API. Install the 'WooCommerce Legacy REST API' plugin, then reconnect.",
          404,
        );
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new WooCommerceApiError(
        `WooCommerce rejected the consumer key/secret (${res.status}). Confirm they have read-only Products access.`,
        res.status,
      );
    }
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new WooCommerceApiError(
      `WooCommerce API error ${res.status}${body?.message ? `: ${body.message}` : ""}.`,
      res.status,
    );
  }

  return { json: (await res.json()) as T, headers: res.headers };
}

export interface WooCommerceTestResult {
  ok: boolean;
  storeName: string;
  storeUrl: string;
  /** 0 when the store has no products yet. */
  productCount: number;
}

/** GET / — store metadata; a valid key proves access. */
export async function testWooCommerceConnection(
  credentials: WooCommerceCredentials,
): Promise<WooCommerceTestResult> {
  const { json } = await wooFetch<{ name?: string; url?: string }>(credentials, "");
  const storeName = (json.name?.trim() ?? "") || normalizeStoreUrl(credentials.storeUrl);
  const count = await wooFetch<unknown[]>(credentials, "?per_page=1").then(
    ({ headers }) => Number(headers.get("X-WP-Total") ?? "0"),
  );
  return {
    ok: true,
    storeName,
    storeUrl: (json.url?.trim() ?? "") || normalizeStoreUrl(credentials.storeUrl),
    productCount: Number.isFinite(count) ? count : 0,
  };
}
export interface WooCommerceListOptions {
  onlyActive?: boolean;
  onProgress?: (fetched: number) => void;
  signal?: { aborted: boolean };
}

/** Full product list with variations, normalized to SellPilot shape. */
export async function listWooCommerceProducts(
  credentials: WooCommerceCredentials,
  options: WooCommerceListOptions = {},
): Promise<NormalizedProduct[]> {
  const signal = options.signal ?? { aborted: false };
  const perPage = 100;

  // Determine total pages. Status `any` includes drafts/pending/private (excludes trash).
  const first = await wooFetch<WooRawProduct[]>(credentials, `?per_page=${perPage}&page=1&status=any`);
  let totalPages = Number(first.headers.get("X-WP-TotalPages") ?? "1");
  if (!Number.isFinite(totalPages) || totalPages < 1) totalPages = 1;

  const rawProducts: WooRawProduct[] = [...first.json];
  for (let page = 2; page <= totalPages; page += 1) {
    if (signal.aborted) break;
    const { json } = await wooFetch<WooRawProduct[]>(credentials, `?per_page=${perPage}&page=${page}&status=any`);
    rawProducts.push(...json);
  }

  const normalized: NormalizedProduct[] = [];
  let fetched = 0;
  for (const raw of rawProducts) {
    if (signal.aborted) break;

    let variations: WooRawVariation[] = [];
    if (raw.type === "variable") {
      const { json } = await wooFetch<WooRawVariation[]>(
        credentials,
        `/products/${raw.id}/variations?per_page=100`,
      );
      variations = json;
    }

    normalized.push(normalizeWooCommerceProduct(raw, variations));
    fetched += 1;
    if (options.onProgress) options.onProgress(fetched);
  }

  return normalized;
}
