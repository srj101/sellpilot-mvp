/**
 * One-off: adds a genuinely relevant photo to each remaining product (real Unsplash
 * photos matched by category, not a generic placeholder), then runs each through the
 * real NVIDIA embedding pipeline and saves it. Throttled to stay under NVIDIA's ~40
 * req/min free-tier limit. Safe to re-run — skips products that already have this image.
 */
import { sql } from "@vercel/postgres";

const NVIDIA_EMBEDDINGS_URL = process.env.NVIDIA_EMBEDDINGS_URL ?? "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL ?? "nvidia/llama-nemotron-embed-vl-1b-v2";
const THROTTLE_MS = 2000;

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error("NVIDIA_API_KEY is not set.");
  process.exit(1);
}

// title -> a real, category-matched Unsplash photo
const IMAGE_BY_TITLE = {
  "Ceramic Flower Vase": "https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Shoe Storage Bench": "https://images.unsplash.com/photo-1736320684415-eda0454f4893?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Coffee Side Table": "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Storage Ottoman Bench": "https://images.unsplash.com/photo-1749703832001-e5ec7e4a81bc?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Wooden Bar Stool": "https://images.unsplash.com/photo-1566921895456-1cee64031c33?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Bamboo Bookshelf": "https://images.unsplash.com/photo-1554625170-a99bf5e957c9?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Bean Bag Chair": "https://images.unsplash.com/photo-1573012678310-a451f9841bb1?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Folding Study Table": "https://images.unsplash.com/photo-1608093310343-9a9949f40557?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Hanging Storage Bag": "https://images.unsplash.com/photo-1683181181300-44c0c991a2cf?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Drawer Divider Set": "https://images.unsplash.com/photo-1676907225475-f9aea84435ac?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Shoe Rack Cabinet": "https://images.unsplash.com/photo-1515762909411-f9aea3cb6969?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Closet Organizer Set": "https://images.unsplash.com/photo-1683181181300-44c0c991a2cf?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Wooden Wall Shelf": "https://images.unsplash.com/photo-1616498429378-896bcc57c78d?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Under-Bed Storage Box": "https://images.unsplash.com/photo-1558857563-b371033873b8?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Foldable Laundry Basket": "https://images.unsplash.com/photo-1639739767611-cc582846849f?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Bath Robe": "https://images.unsplash.com/photo-1524677198710-77873f5420cd?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Shower Curtain": "https://images.unsplash.com/photo-1587777923830-8c92f0f0a9fc?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Bathroom Storage Rack": "https://images.unsplash.com/photo-1599447069021-11fa1b497b10?fm=jpg&q=60&w=800&auto=format&fit=crop",
  "Soap Dispenser Set": "https://images.unsplash.com/photo-1714399417136-d328f3ea14c7?fm=jpg&q=60&w=800&auto=format&fit=crop",
};

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

let done = 0;
let skipped = 0;
let failed = 0;

for (const [title, imageUrl] of Object.entries(IMAGE_BY_TITLE)) {
  const { rows: products } = await sql`SELECT id, business_id, images FROM "product" WHERE title = ${title} LIMIT 1`;
  if (products.length === 0) {
    console.warn(`Product not found: ${title}`);
    continue;
  }
  const product = products[0];

  const { rows: existing } = await sql`
    SELECT id FROM "product_image_embedding" WHERE product_id = ${product.id} AND image_url = ${imageUrl}
  `;
  if (existing.length > 0) {
    console.log(`Skipping (already indexed): ${title}`);
    skipped++;
    continue;
  }

  try {
    if (!product.images.includes(imageUrl)) {
      await sql`UPDATE "product" SET images = images || ${JSON.stringify([imageUrl])}::jsonb WHERE id = ${product.id}`;
    }

    const embedding = await embedImage(imageUrl);
    const vectorLiteral = `[${embedding.join(",")}]`;
    await sql`
      INSERT INTO "product_image_embedding" (id, business_id, product_id, variant_id, image_url, product_title, embedding)
      VALUES (gen_random_uuid()::text, ${product.business_id}, ${product.id}, NULL, ${imageUrl}, ${title}, ${vectorLiteral})
    `;
    console.log(`Indexed: ${title}`);
    done++;
  } catch (err) {
    console.error(`Failed: ${title} —`, err.message);
    failed++;
  }

  await sleep(THROTTLE_MS);
}

console.log(`\nDone: ${done}, skipped: ${skipped}, failed: ${failed}`);
process.exit(0);
