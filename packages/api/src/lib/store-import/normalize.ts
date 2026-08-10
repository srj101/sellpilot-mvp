import type { NormalizedOption, NormalizedProduct, NormalizedVariant } from "./types";

/** "12.99" | 1299 → 1299. Rounds, never floors, so prices drift down. */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** "4.5" | 0 | "0" | null → integer star rating (1–5) or null. 0 = no reviews. */
export function ratingToInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** A single-image helper used by both providers: first non-empty image URL wins. */
export function firstImage(...urls: (string | null | undefined)[]): string | null {
  for (const u of urls) {
    if (u?.trim()) return u.trim();
  }
  return null;
}

/** Trim, empty → null. Used wherever a blank provider field should collapse to NULL. */
function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** First non-empty value — WooCommerce ships empty strings, not nulls, for unset prices. */
function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v?.trim()) return v;
  }
  return null;
}

/** Build option1/2/3 from an ordered option map. Never emits empty strings, always nulls. */
export function optionSlots(
  optionNames: string[],
  byName: Record<string, string | undefined>,
): { option1: string | null; option2: string | null; option3: string | null } {
  const get = (name: string) => trimOrNull(byName[name]);
  return {
    option1: optionNames[0] ? get(optionNames[0]) : null,
    option2: optionNames[1] ? get(optionNames[1]) : null,
    option3: optionNames[2] ? get(optionNames[2]) : null,
  };
}

/**
 * Pure mapping Shopify product + variants → NormalizedProduct. Kept free of any
 * fetch/db work so it's directly unit-testable with fixture data.
 */
export function normalizeShopifyProduct(
  raw: ShopifyRawProduct,
  imageSrcById: Map<string, string>,
): NormalizedProduct {
  // Shopify always mints a fake "Title" option ("Default Title") on optionless products.
  const options: NormalizedOption[] = (raw.options ?? [])
    .filter(
      (o) => !(o.name === "Title" && (o.values ?? []).length === 1 && o.values?.[0] === "Default Title"),
    )
    .map((o) => ({ name: o.name, values: o.values ?? [] }));
  const optionNames = options.map((o) => o.name);

  const images = (raw.images ?? []).map((i) => i.src).filter(Boolean);

  const variants: NormalizedVariant[] = (raw.variants ?? []).map((v) => {
    const variantOptionMap: Record<string, string | undefined> = {};
    options.forEach((o, idx) => {
      const slot = idx === 0 ? v.option1 : idx === 1 ? v.option2 : idx === 2 ? v.option3 : undefined;
      variantOptionMap[o.name] = slot ?? undefined;
    });
    const slots = optionSlots(optionNames, variantOptionMap);
    const derivedTitle = optionNames.length
      ? optionNames.map((n) => variantOptionMap[n] ?? "").join(" / ")
      : "Default";
    const rawTitle = v.title ?? "";
    const title = rawTitle === "Default Title" || rawTitle === "" ? derivedTitle : rawTitle;

    return {
      title,
      option1: slots.option1,
      option2: slots.option2,
      option3: slots.option3,
      price: toCents(v.price),
      compareAtPrice: v.compare_at_price ? toCents(v.compare_at_price) : null,
      sku: trimOrNull(v.sku),
      inventoryQuantity: v.inventory_management ? v.inventory_quantity ?? 0 : 0,
      imageUrl: v.image_id != null ? (imageSrcById.get(String(v.image_id)) ?? null) : null,
      externalVariantId: String(v.id),
    };
  });

  const status: NormalizedProduct["status"] =
    raw.status === "draft" || raw.status === "archived" ? raw.status : "active";

  return {
    externalProductId: String(raw.id),
    title: raw.title,
    description: raw.body_html ?? null,
    category: trimOrNull(raw.product_type),
    status,
    images,
    options,
    rating: null, // Shopify REST product object carries no store rating
    variants,
  };
}

/** Pure mapping WooCommerce product (+ optional variations) → NormalizedProduct. */
export function normalizeWooCommerceProduct(
  raw: WooRawProduct,
  variations: WooRawVariation[] = [],
): NormalizedProduct {
  // Only attributes flagged as options drive variants (color/size); non-variation
  // attributes (e.g. material) are product metadata, not options here.
  const variationAttributes = (raw.attributes ?? []).filter((a) => a.variation === true);
  const options: NormalizedOption[] = variationAttributes.map((a) => ({
    name: a.name,
    values: a.options ?? [],
  }));
  const optionNames = options.map((o) => o.name);

  const images = (raw.images ?? []).map((i) => i.src).filter(Boolean);

  const isVariable = raw.type === "variable";

  const variants: NormalizedVariant[] = isVariable
    ? variations.map((v) => {
        const attrByName: Record<string, string | undefined> = {};
        for (const a of v.attributes ?? []) {
          attrByName[a.name] = a.option;
        }
        const slots = optionSlots(optionNames, attrByName);
        const labels = optionNames.map((n) => attrByName[n] ?? "").filter(Boolean);
        return {
          title: labels.length ? labels.join(" / ") : "Default",
          option1: slots.option1,
          option2: slots.option2,
          option3: slots.option3,
          price: toCents(firstNonEmpty(v.sale_price, v.price)),
          compareAtPrice: pickCompareAt(v.price, v.regular_price),
          sku: trimOrNull(v.sku),
          // Variation with manage_stock "parent" inherits from the parent product.
          inventoryQuantity: v.manage_stock === "parent" ? raw.stock_quantity ?? 0 : v.manage_stock ? v.stock_quantity ?? 0 : 0,
          imageUrl: v.image?.src ?? null,
          externalVariantId: String(v.id),
        };
      })
    : [
        {
          title: "Default",
          option1: null,
          option2: null,
          option3: null,
          price: toCents(firstNonEmpty(raw.sale_price, raw.price)),
          compareAtPrice: pickCompareAt(raw.price, raw.regular_price),
          sku: trimOrNull(raw.sku),
          inventoryQuantity: raw.manage_stock ? raw.stock_quantity ?? 0 : 0,
          imageUrl: images[0] ?? null,
          externalVariantId: `${raw.id}-default`,
        },
      ];

  const status: NormalizedProduct["status"] = raw.status === "publish" ? "active" : "draft";

  return {
    externalProductId: String(raw.id),
    title: raw.name,
    description: raw.description ?? null,
    category: raw.categories?.[0]?.name ?? null,
    status,
    images,
    options,
    rating: ratingToInt(raw.average_rating),
    variants,
  };
}

function pickCompareAt(base: string | null | undefined, regular: string | null | undefined): number | null {
  if (!base || !regular) return null;
  const sale = Number.parseFloat(base);
  const orig = Number.parseFloat(regular);
  if (!Number.isFinite(sale) || !Number.isFinite(orig)) return null;
  return orig > sale ? toCents(regular) : null;
}

/* ------------------------------------------------------------------ */
/* Raw provider shapes — kept local so provider clients stay isolated. */
/* ------------------------------------------------------------------ */

export interface ShopifyRawProduct {
  id: number | string;
  title: string;
  body_html?: string | null;
  product_type?: string | null;
  status?: string;
  images?: { id?: number | string; src: string }[];
  options?: { name: string; values?: string[] }[];
  variants?: {
    id: number | string;
    title?: string;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    price?: string | null;
    compare_at_price?: string | null;
    sku?: string | null;
    inventory_management?: string | null;
    inventory_quantity?: number | null;
    image_id?: number | string | null;
  }[];
}

export interface WooRawProduct {
  id: number | string;
  name: string;
  description?: string | null;
  type?: string;
  status?: string;
  sku?: string | null;
  price?: string | null;
  regular_price?: string | null;
  sale_price?: string | null;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  average_rating?: string | null;
  images?: { src: string }[];
  categories?: { name: string }[];
  attributes?: { name: string; options?: string[]; variation?: boolean }[];
}

export interface WooRawVariation {
  id: number | string;
  sku?: string | null;
  price?: string | null;
  regular_price?: string | null;
  sale_price?: string | null;
  manage_stock?: boolean | "parent";
  stock_quantity?: number | null;
  image?: { src: string } | null;
  attributes?: { name: string; option?: string }[];
}
