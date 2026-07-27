/**
 * One-off verification script: replaces the earlier random placeholder test image with
 * one that actually matches the product ("Wall Art Canvas Print" -> an actual canvas
 * wall art photo), re-embeds it via the real NVIDIA pipeline, and saves it into
 * product_image_embedding. Cleans up the old dummy image/embedding first.
 */
import { sql } from "@vercel/postgres";

const OLD_DUMMY_IMAGE_URL = "https://picsum.photos/seed/sellpilot-wall-art/600/600";
// A real "mountains painting" canvas print photo (Unsplash), actually matching the product.
const TEST_IMAGE_URL =
  "https://images.unsplash.com/photo-1583766432613-4e668f167f3f?fm=jpg&q=60&w=800&auto=format&fit=crop";

const NVIDIA_EMBEDDINGS_URL = process.env.NVIDIA_EMBEDDINGS_URL ?? "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL ?? "nvidia/llama-nemotron-embed-vl-1b-v2";

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error("NVIDIA_API_KEY is not set.");
  process.exit(1);
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

const { rows: products } = await sql`SELECT id, business_id, title, images FROM "product" WHERE title = 'Wall Art Canvas Print' LIMIT 1`;
if (products.length === 0) {
  console.error("Test product not found.");
  process.exit(1);
}
const product = products[0];
console.log(`Using product: ${product.title} (${product.id})`);

// 1. Remove the old dummy image + its embedding row
await sql`DELETE FROM "product_image_embedding" WHERE product_id = ${product.id} AND image_url = ${OLD_DUMMY_IMAGE_URL}`;
const cleanedImages = product.images.filter((url) => url !== OLD_DUMMY_IMAGE_URL);
await sql`UPDATE "product" SET images = ${JSON.stringify(cleanedImages)}::jsonb WHERE id = ${product.id}`;
console.log("Removed old dummy image and its embedding.");

// 2. Add the real, relevant test image
await sql`UPDATE "product" SET images = images || ${JSON.stringify([TEST_IMAGE_URL])}::jsonb WHERE id = ${product.id}`;
console.log(`Added correct image: ${TEST_IMAGE_URL}`);

// 3. Embed and save
console.log("Requesting embedding from NVIDIA...");
const embedding = await embedImage(TEST_IMAGE_URL);
console.log(`Got embedding: ${embedding.length} dimensions.`);

const vectorLiteral = `[${embedding.join(",")}]`;
await sql`
  INSERT INTO "product_image_embedding" (id, business_id, product_id, variant_id, image_url, product_title, embedding)
  VALUES (gen_random_uuid()::text, ${product.business_id}, ${product.id}, NULL, ${TEST_IMAGE_URL}, ${product.title}, ${vectorLiteral})
`;
console.log("Saved embedding row to product_image_embedding.");

const { rows: check } = await sql`
  SELECT id, product_title, image_url, (embedding <=> ${vectorLiteral}::vector) AS self_distance
  FROM "product_image_embedding"
  WHERE product_id = ${product.id}
`;
console.log("Verification query result:", check);

process.exit(0);
