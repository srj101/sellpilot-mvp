/**
 * One-time backfill: embeds and indexes every existing product/variant image that isn't
 * already in `product_image_embedding` — needed both because images saved before this
 * feature existed were never indexed, and because any embeddings from the old
 * mock-vector/ChromaDB era are semantically garbage and were never migrated here. Safe to
 * re-run — skips anything already indexed.
 *
 * Self-contained (raw SQL + a direct NVIDIA call, no cross-package TS import) to match
 * the existing scripts/backfill-transactions.mjs precedent. Throttled to stay under
 * NVIDIA's free-tier ~40 req/min limit (see packages/api/src/lib/embeddings.ts for the
 * same API contract — model/URL overridable via NVIDIA_EMBED_MODEL/NVIDIA_EMBEDDINGS_URL,
 * kept in sync manually since this script can't import that file).
 *
 * Run from packages/db (same as backfill-transactions.mjs, for module resolution):
 *   cd packages/db && node --env-file=../../.env ../../scripts/backfill-product-image-embeddings.mjs
 */
import { sql } from "@vercel/postgres";

const NVIDIA_EMBEDDINGS_URL = process.env.NVIDIA_EMBEDDINGS_URL ?? "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL ?? "nvidia/llama-nemotron-embed-vl-1b-v2";
const THROTTLE_MS = 2000; // ~30 req/min, safely under the ~40 req/min free-tier ceiling

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error("NVIDIA_API_KEY is not set — nothing to backfill with. Aborting.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedImage(imageUrl) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image (${imageResponse.status}): ${imageUrl}`);
  }
  const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

  const response = await fetch(NVIDIA_EMBEDDINGS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    // Images can only be embedded as "passage" — the API rejects "query" for image input.
    body: JSON.stringify({ input: [dataUri], model: EMBED_MODEL, input_type: "passage" }),
  });
  if (!response.ok) {
    throw new Error(`NVIDIA embeddings request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  const result = await response.json();
  const embedding = result.data?.[0]?.embedding;
  if (!embedding) throw new Error("NVIDIA embeddings response had no embedding data.");
  return embedding;
}

function toVectorLiteral(embedding) {
  return `[${embedding.join(",")}]`;
}

// --- Product-level images (product.images is a jsonb string[]) ---
const { rows: products } = await sql`
  SELECT id, business_id, title, images
  FROM "product"
  WHERE jsonb_array_length(images) > 0
`;

let productImagesDone = 0;
for (const p of products) {
  for (const imageUrl of p.images) {
    const { rows: existing } = await sql`
      SELECT id FROM "product_image_embedding"
      WHERE product_id = ${p.id} AND variant_id IS NULL AND image_url = ${imageUrl}
    `;
    if (existing.length > 0) continue;

    try {
      const embedding = await embedImage(imageUrl);
      await sql`
        INSERT INTO "product_image_embedding" (id, business_id, product_id, variant_id, image_url, product_title, embedding)
        VALUES (gen_random_uuid()::text, ${p.business_id}, ${p.id}, NULL, ${imageUrl}, ${p.title}, ${toVectorLiteral(embedding)})
      `;
      productImagesDone++;
      console.log(`Indexed product image: ${p.title} (${imageUrl})`);
    } catch (err) {
      console.error(`Failed to index product image for "${p.title}" (${imageUrl}):`, err.message);
    }
    await sleep(THROTTLE_MS);
  }
}
console.log(`Backfilled ${productImagesDone} product-level images.`);

// --- Variant images (product_variant.image_url is a single nullable column) ---
const { rows: variants } = await sql`
  SELECT pv.id AS variant_id, pv.image_url, p.id AS product_id, p.business_id, p.title
  FROM "product_variant" pv
  JOIN "product" p ON p.id = pv.product_id
  WHERE pv.image_url IS NOT NULL
`;

let variantImagesDone = 0;
for (const v of variants) {
  const { rows: existing } = await sql`
    SELECT id FROM "product_image_embedding" WHERE variant_id = ${v.variant_id}
  `;
  if (existing.length > 0) continue;

  try {
    const embedding = await embedImage(v.image_url);
    await sql`
      INSERT INTO "product_image_embedding" (id, business_id, product_id, variant_id, image_url, product_title, embedding)
      VALUES (gen_random_uuid()::text, ${v.business_id}, ${v.product_id}, ${v.variant_id}, ${v.image_url}, ${v.title}, ${toVectorLiteral(embedding)})
    `;
    variantImagesDone++;
    console.log(`Indexed variant image: ${v.title} (${v.image_url})`);
  } catch (err) {
    console.error(`Failed to index variant image for "${v.title}" (${v.image_url}):`, err.message);
  }
  await sleep(THROTTLE_MS);
}
console.log(`Backfilled ${variantImagesDone} variant images.`);

process.exit(0);
