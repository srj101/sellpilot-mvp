import type { ShopifyCredentials, StoreProvider } from "./types";
import type { NormalizedProduct } from "./types";
import type { ShopifyRawProduct } from "./normalize";
import { normalizeShopifyProduct } from "./normalize";

/**
 * Shopify Admin REST API client (API version 2026-07).
 *
 * Docs notes (see research):
 * - REST is the correct choice for a *custom* app (admin-issued access token) — the
 *   "REST is legacy" rule only applies to new *public* apps.
 * - Auth: `X-Shopify-Access-Token` header.
 * - Pagination: cursor-based via the `Link` response header (`page_info`), `limit=250`.
 * - Rate limit: 40 requests / store / minute; on 429 we read `Retry-After` and back off.
 * - `401` = invalid token, `403` = token lacks `read_products` scope.
 */

const API_VERSION = "2026-07";

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

function normalizeStoreUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function apiUrl(credentials: ShopifyCredentials, path: string): string {
  return `${normalizeStoreUrl(credentials.storeUrl)}/admin/api/${API_VERSION}${path}`;
}

/** Parse the `Link` header's `rel="next"` cursor. */
function nextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  if (!match?.[1]) return null;
  const pageInfo = /[?&]page_info=([^&]+)/.exec(match[1]);
  return pageInfo?.[1] ? decodeURIComponent(pageInfo[1]) : null;
}

interface FetchOptions {
  timeoutMs?: number;
  /** Consecutive 429 backoffs before giving up (rate-limit resilience). */
  maxRetries?: number;
}

async function shopifyFetch<T>(
  credentials: ShopifyCredentials,
  path: string,
  { timeoutMs = 30_000, maxRetries = 3 }: FetchOptions = {},
): Promise<T> {
  const url = apiUrl(credentials, path);
  let attempts = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { "X-Shopify-Access-Token": credentials.accessToken, "Accept": "application/json" },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new ShopifyApiError(`Shopify request timed out after ${timeoutMs}ms.`, 408);
      }
      throw new ShopifyApiError(`Shopify request failed: ${err instanceof Error ? err.message : String(err)}`, 0);
    }
    clearTimeout(timer);

    if (res.status === 429 && attempts < maxRetries) {
      attempts += 1;
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
      continue;
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { errors?: unknown } | null;
      const detail = body?.errors ? JSON.stringify(body.errors) : "";
      if (res.status === 401) {
        throw new ShopifyApiError(`Shopify rejected the access token (401). Double-check it's active and pasted correctly.`, 401);
      }
      if (res.status === 403) {
        throw new ShopifyApiError(`Your Shopify token is missing the read_products scope (403). Re-create the token with Products > Read access.`, 403);
      }
      throw new ShopifyApiError(`Shopify API error ${res.status}${detail ? `: ${detail}` : ""}.`, res.status);
    }

    return (await res.json()) as T;
  }
}

/** Fetch every page of a cursor-paginated collection (e.g. /products.json). */
async function fetchAllPaginated<T>(
  credentials: ShopifyCredentials,
  path: string,
  field: string,
  signal: { aborted: boolean },
): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | null = null;

  while (true) {
    const suffix = cursor ? `${path}&page_info=${encodeURIComponent(cursor)}` : path;
    const res = await fetch(apiUrl(credentials, suffix), {
      headers: { "X-Shopify-Access-Token": credentials.accessToken, "Accept": "application/json" },
    });
    if (!res.ok) {
      throw new ShopifyApiError(`Shopify API error ${res.status} while fetching ${field}.`, res.status);
    }
    const link = res.headers.get("Link");
    const json = (await res.json()) as Record<string, T[]>;
    results.push(...(json[field] ?? []));

    const next = nextPageInfo(link);
    if (!next) break;
    cursor = next;
    if (signal.aborted) break;
  }
  return results;
}

export interface ShopifyTestResult {
  ok: boolean;
  storeName: string;
  storeUrl: string;
  shopId: string;
}

/** GET /shop.json — verifies the token and returns the store's display name. */
export async function testShopifyConnection(credentials: ShopifyCredentials): Promise<ShopifyTestResult> {
  const shop = await shopifyFetch<{ shop: { name?: string; id?: number | string; myshopify_domain?: string } }>(
    credentials,
    "/shop.json",
  );
  return {
    ok: true,
    storeName: shop.shop.name ?? shop.shop.myshopify_domain ?? normalizeStoreUrl(credentials.storeUrl),
    storeUrl: normalizeStoreUrl(credentials.storeUrl),
    shopId: shop.shop.id != null ? String(shop.shop.id) : "",
  };
}

export interface ShopifyListOptions {
  /** `true` = only active products (import picker default), `false` = include drafts. */
  onlyActive?: boolean;
  onProgress?: (fetched: number) => void;
  signal?: { aborted: boolean };
}

/** Full product list with variants, normalized to SellPilot shape. */
export async function listShopifyProducts(
  credentials: ShopifyCredentials,
  options: ShopifyListOptions = {},
): Promise<NormalizedProduct[]> {
  const signal = options.signal ?? { aborted: false };
  const statusFilter = options.onlyActive ? "&status=active" : "";
  const basePath = `/products.json?limit=250&fields=id,title,body_html,product_type,status,images,options,variants${statusFilter}`;

  const rawProducts = await fetchAllPaginated<ShopifyRawProduct>(credentials, basePath, "products", signal);

  const normalized: NormalizedProduct[] = [];
  let fetched = 0;
  for (const raw of rawProducts) {
    if (signal.aborted) break;

    // Map variant image_id → image src (variant.image_id is opaque until joined to images[]).
    const imageSrcById = new Map<string, string>();
    for (const img of raw.images ?? []) {
      if (img.id != null && img.src) imageSrcById.set(String(img.id), img.src);
    }

    normalized.push(normalizeShopifyProduct(raw, imageSrcById));
    fetched += 1;
    if (options.onProgress) options.onProgress(fetched);
  }

  return normalized;
}

export function providerLabel(provider: StoreProvider): string {
  return provider === "shopify" ? "Shopify" : "WooCommerce";
}
