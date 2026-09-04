/**
 * Builds what product search actually searches.
 *
 * Search used to run in Node: load every product for a business, then require each word of
 * the customer's message to appear as a literal substring of the title or description.
 * "Runner sneaker" could not find "Running Sneakers" — "running" does not contain the
 * string "runner" — and a customer typing "জুতা" or "juta" could never match anything,
 * because the catalogue is written in English. Real customers were told
 * "ami verify korte parini" about products sitting in the database.
 *
 * The fix moves the work to write time. Everything a customer might plausibly type is
 * flattened into product.searchText, which a pg_trgm GIN index covers, and the query
 * becomes one indexed similarity lookup. Bangla works because the Bangla words are
 * genuinely in the column — no translation step at query time, no per-search API call,
 * and nothing that breaks when an embedding provider rate-limits.
 */
import { and, eq } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { product, productVariant } from "@acme/db/schema";
import { env } from "@acme/env";

/** Generous but bounded: enough for both scripts plus synonyms, small enough that one bad
 * generation cannot bloat the index or drown the real title in noise. */
const MAX_KEYWORDS = 25;
const MAX_KEYWORD_LENGTH = 40;

const KEYWORD_SYSTEM_PROMPT = `You generate product search keywords for a Bangladeshi social-commerce store.

Given a product, list the words and short phrases a customer might type when looking for it — in a Facebook or WhatsApp chat, on a phone, in a hurry.

Include all of:
- English words for the product type, including ones not in the title (a "Running Sneakers" is also a shoe, sports shoe, keds, trainers)
- Bangla script words (জুতা, শার্ট, ঘড়ি, ব্যাগ)
- Romanized Bangla, how people actually type it in chat (juta, shirt, ghori, bag). ALWAYS include the romanized form of every Bangla word you list — most customers type Bangla in English letters, not Bangla script.
- Common misspellings a customer would realistically make
- Brand, material, colour or occasion words that appear in the product

Rules:
- Output ONLY a comma-separated list. No numbering, no explanation, no quotes, no trailing period.
- MANDATORY: at least 3 terms in Bangla script, and the romanized spelling of each one. A list with no Bangla script is wrong, however good the English terms are — most customers here type Bangla.
- Do not include generic commerce filler ("product", "item", "thing", "new", "best", "quality", "price"). Those match every query and drown out real matches.
- Maximum 25 terms.
- Each term is 1-3 words.
- Do not repeat words already in the product title — those are searched anyway.
- Do not invent facts about the product. If you do not know the brand, do not guess one.`;

function buildKeywordUserPrompt(input: {
  title: string;
  description?: string | null;
  category?: string | null;
  gender?: string | null;
}): string {
  const lines = [`Title: ${input.title}`];
  if (input.category) lines.push(`Category: ${input.category}`);
  if (input.gender) lines.push(`For: ${input.gender}`);
  if (input.description) lines.push(`Description: ${input.description}`);
  return lines.join("\n");
}

function normalizeKeywordList(raw: string): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    // Models like to prefix list items even when told not to.
    const term = part.replace(/^[\s\-*\d.)]+/, "").trim().replace(/[."']+$/, "");
    if (!term || term.length > MAX_KEYWORD_LENGTH) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= MAX_KEYWORDS) break;
  }
  return terms.join(", ");
}

/**
 * Ask the model for search terms. Returns null on any failure — a product with no
 * generated keywords is still fully searchable by its own title, description and
 * category, so this must never be able to fail a product write.
 */
export async function generateProductKeywords(input: {
  title: string;
  description?: string | null;
  category?: string | null;
  gender?: string | null;
}): Promise<string | null> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages: [
          { role: "system", content: KEYWORD_SYSTEM_PROMPT },
          { role: "user", content: buildKeywordUserPrompt(input) },
        ],
        // Low: the instructions are specific and the output feeds an index, so
        // reproducibility matters more than variety here. At 0.4 a regeneration silently
        // dropped "juta" from a shoe — exactly the term the whole feature exists to catch.
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[product-search-text] keyword generation failed (${response.status}): ${body.slice(0, 200)}`);
      return null;
    }

    const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = result.choices?.[0]?.message?.content;
    if (!content) return null;

    const normalized = normalizeKeywordList(content);
    return normalized || null;
  } catch (err) {
    console.warn("[product-search-text] keyword generation errored:", err);
    return null;
  }
}

/** Flatten every searchable field into the one column the trigram index covers. */
export function composeSearchText(input: {
  title: string;
  description?: string | null;
  category?: string | null;
  gender?: string | null;
  variantTitles?: (string | null)[];
  skus?: (string | null)[];
  searchKeywords?: string | null;
}): string {
  const parts = [
    input.title,
    input.category,
    input.gender,
    input.description,
    ...(input.variantTitles ?? []),
    ...(input.skus ?? []),
    input.searchKeywords,
  ];

  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .toLowerCase()
    // Collapse punctuation to spaces so "men's" matches "mens" and a comma-separated
    // keyword list becomes plain words.
    //
    // \p{M} is essential and easy to miss: Bangla vowel signs and the hasant (ু, া, ্, ি)
    // are Unicode Marks, not Letters, so a \p{L}-only class silently shreds "জুতা" into
    // "জ ত" — every Bangla word reduced to bare consonants, and every Bangla search
    // scoring near zero against text that looked correct in the database.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recompute product.searchText from the row's current state.
 *
 * Called after every product write. Deliberately does NOT generate keywords — that costs
 * an LLM call and belongs on the queue (see queueProductKeywordIndexing); this only
 * reflows what is already stored, so a price edit stays a single cheap UPDATE.
 */
export async function rebuildProductSearchText(db: typeof Db, productId: string): Promise<void> {
  const [row] = await db.select().from(product).where(eq(product.id, productId)).limit(1);
  if (!row) return;

  const variants = await db
    .select({ title: productVariant.title, sku: productVariant.sku })
    .from(productVariant)
    .where(eq(productVariant.productId, productId));

  const searchText = composeSearchText({
    title: row.title,
    description: row.description,
    category: row.category,
    gender: row.gender,
    variantTitles: variants.map((v) => v.title),
    skus: variants.map((v) => v.sku),
    searchKeywords: row.searchKeywords,
  });

  await db.update(product).set({ searchText }).where(eq(product.id, productId));
}

/**
 * Generate keywords for a product and fold them into its searchText.
 *
 * Runs on the indexing queue, never inline: a merchant saving a product should not wait on
 * a model, and a model outage must not block the save.
 */
export async function refreshProductKeywords(
  db: typeof Db,
  businessId: string,
  productId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, productId), eq(product.businessId, businessId)))
    .limit(1);
  if (!row) return;

  // A merchant's own keywords are authoritative. Regenerating over them would silently
  // undo the edit they made precisely because the generated set was wrong.
  if (row.searchKeywords?.trim()) {
    await rebuildProductSearchText(db, productId);
    return;
  }

  const keywords = await generateProductKeywords({
    title: row.title,
    description: row.description,
    category: row.category,
    gender: row.gender,
  });

  if (keywords) {
    await db.update(product).set({ searchKeywords: keywords }).where(eq(product.id, productId));
  }
  await rebuildProductSearchText(db, productId);
}
