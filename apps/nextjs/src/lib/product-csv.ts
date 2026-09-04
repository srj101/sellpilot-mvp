/**
 * CSV parsing for product imports, shared by the Products page and the onboarding
 * "Add products" step — which had grown two near-identical copies of this logic.
 *
 * The point of the extra work here is that a spreadsheet is not a JSON document. Numbers
 * come out of Excel, Shopify exports and hand-typed sheets as "৳1,200.50", "15%", "4,5",
 * "4/5", " 20 " — all of which `Number()` turns into NaN or, worse, silently mis-reads.
 * The old parser called `Number()` directly and passed the result straight to the server,
 * so a perfectly ordinary file (fractional ratings like 4.5) rendered fine in the preview
 * table and then failed the whole import with a wall of Zod errors:
 *
 *   { "expected": "int", "path": ["products", 0, "rating"],
 *     "message": "Invalid input: expected int, received number" }
 *
 * Nothing in that message tells a merchant that their rating column needs whole numbers,
 * and there is no reason it should: rounding 4.5 to 4 is obviously what they meant.
 */

export interface BulkRow {
  title: string;
  category?: string;
  gender?: string;
  price: number;
  discountPercent?: number;
  stockQty: number;
  description?: string;
  rating?: number;
  imageUrl?: string;
  /** Optional. Left blank, the AI generates keywords after import. */
  searchKeywords?: string;
}

export interface ParsedProductCsv {
  rows: BulkRow[];
  /** Rows dropped for having no usable title or price. */
  skipped: number;
  /** Rows kept, but with at least one value rounded or clamped to fit. */
  adjusted: number;
}

const GENDER_VALUES = new Set(["men", "women", "unisex", "kids"]);

/** First non-empty value among the given column aliases. */
export function pickField(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}

export function normalizeGender(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  return value && GENDER_VALUES.has(value) ? value : undefined;
}

/**
 * Read a number out of whatever a spreadsheet cell happens to contain.
 *
 * Handles currency symbols and units ("৳1200", "1200 BDT"), percent signs ("15%"),
 * thousands separators ("1,200"), decimal commas ("4,5" — standard in much of the world
 * and what Excel writes under a non-English locale), and ratio notation ("4/5").
 *
 * Returns null rather than NaN so callers have to decide what a missing value means.
 */
export function parseLooseNumber(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let text = raw.trim();
  if (!text) return null;

  // "4/5", "8 / 10" — take the score, discard the scale. The caller clamps to its own range.
  const ratio = /^(\d+(?:[.,]\d+)?)\s*\/\s*\d+(?:[.,]\d+)?$/.exec(text);
  if (ratio?.[1]) text = ratio[1];

  const negative = /^\s*-/.test(text);
  // Drop everything that cannot be part of a number: currency symbols, "%", "stars", spaces.
  text = text.replace(/[^\d.,]/g, "");
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal point, the other groups thousands.
    text =
      lastComma > lastDot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (lastComma > -1) {
    // A lone comma is a decimal point when 1-2 digits follow it ("4,5", "1200,50").
    // Thousands groups are always exactly three digits, so "1,200" falls through to the
    // separator branch and reads as 1200 rather than 1.2.
    const decimals = text.length - lastComma - 1;
    const single = text.indexOf(",") === lastComma;
    text = single && decimals >= 1 && decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Prices are stored in an integer column, so a fractional price would fail at the database
 * rather than at validation. Rounded here, where it can be reported to the user. */
export function parsePrice(raw: string | undefined): { value: number | null; adjusted: boolean } {
  const parsed = parseLooseNumber(raw);
  if (parsed === null || parsed <= 0) return { value: null, adjusted: false };
  const rounded = Math.round(parsed);
  if (rounded <= 0) return { value: null, adjusted: false };
  return { value: rounded, adjusted: rounded !== parsed };
}

/** Whole units on hand. Anything unreadable means zero, not a rejected row. */
export function parseStockQty(raw: string | undefined): { value: number; adjusted: boolean } {
  const parsed = parseLooseNumber(raw);
  if (parsed === null) return { value: 0, adjusted: false };
  const value = Math.max(0, Math.round(parsed));
  return { value, adjusted: value !== parsed };
}

/** 0-100. "15%", "15", "0,15" all read as written — a bare 0.15 is left alone rather than
 * guessed at, because a 0.15% discount is a legitimate thing to write. */
export function parseDiscountPercent(raw: string | undefined): { value: number | undefined; adjusted: boolean } {
  const parsed = parseLooseNumber(raw);
  if (parsed === null) return { value: undefined, adjusted: false };
  const value = Math.min(100, Math.max(0, parsed));
  return { value, adjusted: value !== parsed };
}

/**
 * 1-5 whole stars.
 *
 * This is the field that broke the import. Fractional ratings are the norm in every
 * storefront export, so they are rounded rather than rejected. A value that rounds to 0
 * becomes "no rating" instead of being forced up to 1 — a 0 in a rating column means
 * unrated, and inventing a one-star review would be worse than leaving it blank.
 */
export function parseRating(raw: string | undefined): { value: number | undefined; adjusted: boolean } {
  const parsed = parseLooseNumber(raw);
  if (parsed === null) return { value: undefined, adjusted: false };
  const rounded = Math.round(parsed);
  if (rounded < 1) return { value: undefined, adjusted: true };
  const value = Math.min(5, rounded);
  return { value, adjusted: value !== parsed };
}

/** Turn Papa Parse's raw rows into rows the bulkCreate mutation accepts. */
export function parseProductCsvRows(rawRows: Record<string, string>[]): ParsedProductCsv {
  const rows: BulkRow[] = [];
  let skipped = 0;
  let adjusted = 0;

  for (const raw of rawRows) {
    const title = pickField(raw, "title", "Title", "name", "Name")?.trim();
    const price = parsePrice(pickField(raw, "price", "Price"));

    // Title and a positive price are the only genuinely required fields; everything else
    // has a sensible empty value.
    if (!title || price.value === null) {
      skipped++;
      continue;
    }

    const stockQty = parseStockQty(pickField(raw, "stockQty", "Stock Qty", "stock", "Stock", "quantity", "Quantity"));
    const discountPercent = parseDiscountPercent(pickField(raw, "discountPercent", "Discount%", "discount", "Discount"));
    const rating = parseRating(pickField(raw, "rating", "Rating"));

    if (price.adjusted || stockQty.adjusted || discountPercent.adjusted || rating.adjusted) {
      adjusted++;
    }

    rows.push({
      title,
      category: pickField(raw, "category", "Category"),
      gender: normalizeGender(pickField(raw, "gender", "Gender")),
      price: price.value,
      discountPercent: discountPercent.value,
      stockQty: stockQty.value,
      description: pickField(raw, "description", "Description"),
      rating: rating.value,
      imageUrl: pickField(raw, "imageUrl", "Image", "image", "Image URL", "image_url"),
      searchKeywords: pickField(raw, "searchKeywords", "Search Keywords", "keywords", "Keywords", "tags", "Tags"),
    });
  }

  return { rows, skipped, adjusted };
}
