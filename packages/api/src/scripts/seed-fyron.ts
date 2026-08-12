/**
 * Seed the Fyron business with footwear products, variants, and product images.
 *
 * Runs the full production pipeline so seeded data is indistinguishable from
 * real merchant-created rows:
 *   1. Downloads each product/variant image from its source URL.
 *   2. Stores it in S3 (LocalStack in dev) via processImageUrl — the same code
 *      path the store-import and manual product create flows use.
 *   3. Inserts the product + variants via createProductFromNormalized.
 *   4. Queues a 2048-d NVIDIA embedding job per image on the BullMQ
 *      "product-images" queue (queueProductImageIndexing). The in-process worker
 *      (instantiated when ../lib/queue is imported) drains the queue and writes
 *      productImageEmbedding rows, so image-similarity search works on seeded data.
 *
 * This script waits for the queue to fully drain before exiting, so embedding
 * generation is guaranteed complete (not fire-and-forget).
 *
 * Usage:
 *   pnpm -F @acme/api exec dotenv -e ../../.env -- \
 *     node ../../node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/seed-fyron.ts [businessId] [--force]
 *
 * --force deletes the business's existing products (cascade: variants + embeddings)
 * before seeding, making the script re-runnable.
 */
import { eq } from "@acme/db";
import { db } from "@acme/db/client";
import { product, productImageEmbedding } from "@acme/db/schema";

import { createProductFromNormalized } from "../lib/store-import/create-product";
import type { NormalizedProduct } from "../lib/store-import/types";
import { productImageQueue, productImageWorker } from "../lib/queue";

const DEFAULT_BUSINESS_ID = "business_mskgf7xg_sk4nr";

interface SeedVariant {
  title: string;
  option1?: string | null;
  option2?: string | null;
  price: number;
  compareAtPrice?: number | null;
  sku: string;
  inventoryQuantity: number;
  imageUrl?: string | null;
}

interface SeedProduct {
  title: string;
  description: string;
  category: string;
  gender: "men" | "women" | "unisex" | "kids";
  images: string[];
  options: { name: string; values: string[] }[];
  rating: number | null;
  variants: SeedVariant[];
}

const FOOTWEAR_IMAGES = {
  redSneaker: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
  whiteSneaker: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80",
  runningShoe: "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=800&q=80",
  nikeShoe: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80",
  leatherShoe: "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&q=80",
  boots: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&q=80",
  sneakerWhite: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=800&q=80",
  highTop: "https://images.unsplash.com/photo-1605348532760-6753d2c43329?w=800&q=80",
  sandal: "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&q=80",
  loafer: "https://images.unsplash.com/photo-1543508282-6319a3e2621f?w=800&q=80",
} as const;

const SIZES_MEN = ["40", "41", "42", "43", "44", "45"];
const SIZES_WOMEN = ["36", "37", "38", "39", "40", "41"];
const SIZES_KIDS = ["27", "28", "29", "30", "31"];

const SEED_PRODUCTS: SeedProduct[] = [
  {
    title: "Classic Red Running Sneaker",
    description:
      "Lightweight everyday running sneaker with a breathable mesh upper, cushioned sole, and a bold red finish. Great for daily jogging, gym, or casual streetwear.",
    category: "Sneakers",
    gender: "men",
    images: [FOOTWEAR_IMAGES.redSneaker, FOOTWEAR_IMAGES.runningShoe],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Red"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_MEN.slice(0, 4).map((size) => ({
        title: `Red / ${size}`,
        option1: "Red",
        option2: size,
        price: 2450,
        compareAtPrice: 2999,
        sku: `FYRN-RSN-${size}`,
        inventoryQuantity: 12,
      })),
    ],
  },
  {
    title: "CloudWhite Casual Sneaker",
    description:
      "Clean minimalist white sneaker with a soft canvas upper and a low-profile rubber sole. Pairs with anything — jeans, chinos, or shorts.",
    category: "Sneakers",
    gender: "unisex",
    images: [FOOTWEAR_IMAGES.whiteSneaker, FOOTWEAR_IMAGES.sneakerWhite],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["White"] },
    ],
    rating: 5,
    variants: [
      ...SIZES_MEN.slice(0, 5).map((size) => ({
        title: `White / ${size}`,
        option1: "White",
        option2: size,
        price: 2200,
        compareAtPrice: 2600,
        sku: `FYRN-CWS-${size}`,
        inventoryQuantity: 18,
      })),
    ],
  },
  {
    title: "ProFlex Running Shoe",
    description:
      "Performance running shoe with a responsive midsole and a breathable engineered knit upper. Built for serious runners and daily trainers.",
    category: "Running Shoes",
    gender: "men",
    images: [FOOTWEAR_IMAGES.runningShoe, FOOTWEAR_IMAGES.redSneaker],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Grey"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_MEN.slice(1, 6).map((size) => ({
        title: `Grey / ${size}`,
        option1: "Grey",
        option2: size,
        price: 3200,
        compareAtPrice: 3800,
        sku: `FYRN-PFR-${size}`,
        inventoryQuantity: 9,
      })),
    ],
  },
  {
    title: "Velocity Court Sneaker",
    description:
      "Street-inspired athletic sneaker with a chunky sole, padded collar, and sporty heel accent. An instant standout in red and white.",
    category: "Sneakers",
    gender: "men",
    images: [FOOTWEAR_IMAGES.nikeShoe],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Red / White"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_MEN.slice(0, 4).map((size) => ({
        title: `Red / White / ${size}`,
        option1: "Red / White",
        option2: size,
        price: 2800,
        compareAtPrice: 3300,
        sku: `FYRN-VCT-${size}`,
        inventoryQuantity: 15,
      })),
    ],
  },
  {
    title: "Heritage Leather Formal Shoe",
    description:
      "Classic oxford-style leather formal shoe with a polished finish and a cushioned insole. Perfect for office, weddings, and formal events.",
    category: "Formal Shoes",
    gender: "men",
    images: [FOOTWEAR_IMAGES.leatherShoe],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Brown"] },
    ],
    rating: 5,
    variants: [
      ...SIZES_MEN.slice(0, 5).map((size) => ({
        title: `Brown / ${size}`,
        option1: "Brown",
        option2: size,
        price: 4100,
        compareAtPrice: 4600,
        sku: `FYRN-HER-${size}`,
        inventoryQuantity: 6,
      })),
    ],
  },
  {
    title: "Rugged Ankle Boot",
    description:
      "Durable leather ankle boot with a rugged lug sole and comfortable lining. Built for winter, trekking, and everyday urban wear.",
    category: "Boots",
    gender: "men",
    images: [FOOTWEAR_IMAGES.boots],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Tan"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_MEN.slice(1, 5).map((size) => ({
        title: `Tan / ${size}`,
        option1: "Tan",
        option2: size,
        price: 3600,
        compareAtPrice: 4200,
        sku: `FYRN-BOOT-${size}`,
        inventoryQuantity: 8,
      })),
    ],
  },
  {
    title: "Court White High-Top Sneaker",
    description:
      "High-top canvas sneaker in crisp white with a retro court profile. A timeless wardrobe staple with great ankle support.",
    category: "Sneakers",
    gender: "unisex",
    images: [FOOTWEAR_IMAGES.highTop, FOOTWEAR_IMAGES.whiteSneaker],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["White"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_MEN.slice(0, 5).map((size) => ({
        title: `White / ${size}`,
        option1: "White",
        option2: size,
        price: 2600,
        compareAtPrice: 3000,
        sku: `FYRN-HT-${size}`,
        inventoryQuantity: 14,
      })),
    ],
  },
  {
    title: "Beach Day Slider Sandal",
    description:
      "Comfortable two-strap slider sandal with a soft cushioned footbed. Ideal for beach, poolside, or casual lounging.",
    category: "Sandals",
    gender: "unisex",
    images: [FOOTWEAR_IMAGES.sandal],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Grey"] },
    ],
    rating: 3,
    variants: [
      ...SIZES_MEN.slice(0, 4).map((size) => ({
        title: `Grey / ${size}`,
        option1: "Grey",
        option2: size,
        price: 950,
        compareAtPrice: 1200,
        sku: `FYRN-SLD-${size}`,
        inventoryQuantity: 25,
      })),
    ],
  },
  {
    title: "Metro Leather Loafer",
    description:
      "Slip-on leather loafer with a sleek silhouette and flexible sole. Smart enough for the office, relaxed enough for weekends.",
    category: "Loafers",
    gender: "men",
    images: [FOOTWEAR_IMAGES.loafer],
    options: [
      { name: "Size", values: SIZES_MEN },
      { name: "Color", values: ["Brown"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_MEN.slice(1, 6).map((size) => ({
        title: `Brown / ${size}`,
        option1: "Brown",
        option2: size,
        price: 2900,
        compareAtPrice: 3400,
        sku: `FYRN-LOF-${size}`,
        inventoryQuantity: 11,
      })),
    ],
  },
  {
    title: "Dainty Women's Flat",
    description:
      "Graceful women's flat with a pointed toe and a padded insole. Comfortable enough to wear all day with dresses, jeans, or office wear.",
    category: "Flats",
    gender: "women",
    images: [FOOTWEAR_IMAGES.leatherShoe, FOOTWEAR_IMAGES.loafer],
    options: [
      { name: "Size", values: SIZES_WOMEN },
      { name: "Color", values: ["Tan"] },
    ],
    rating: 4,
    variants: [
      ...SIZES_WOMEN.slice(0, 5).map((size) => ({
        title: `Tan / ${size}`,
        option1: "Tan",
        option2: size,
        price: 1750,
        compareAtPrice: 2100,
        sku: `FYRN-FLT-${size}`,
        inventoryQuantity: 16,
      })),
    ],
  },
  {
    title: "Kids' School Sneaker",
    description:
      "Sturdy, easy-to-wear school sneaker for kids with a flexible sole and a machine-washable upper. Built to survive the playground.",
    category: "Kids Shoes",
    gender: "kids",
    images: [FOOTWEAR_IMAGES.sneakerWhite, FOOTWEAR_IMAGES.whiteSneaker],
    options: [
      { name: "Size", values: SIZES_KIDS },
      { name: "Color", values: ["White"] },
    ],
    rating: 5,
    variants: [
      ...SIZES_KIDS.slice(0, 5).map((size) => ({
        title: `White / ${size}`,
        option1: "White",
        option2: size,
        price: 1350,
        compareAtPrice: 1600,
        sku: `FYRN-KID-${size}`,
        inventoryQuantity: 30,
      })),
    ],
  },
];

function toNormalized(seed: SeedProduct): NormalizedProduct {
  return {
    externalProductId: seed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    title: seed.title,
    description: seed.description,
    category: seed.category,
    status: "active",
    images: seed.images,
    options: seed.options,
    rating: seed.rating,
    variants: seed.variants.map((v) => ({
      title: v.title,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: null,
      price: v.price * 100,
      compareAtPrice: v.compareAtPrice != null ? v.compareAtPrice * 100 : null,
      sku: v.sku,
      inventoryQuantity: v.inventoryQuantity,
      imageUrl: v.imageUrl ?? null,
      externalVariantId: v.sku,
    })),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the product-images queue has no waiting/active jobs and the expected
 *  number of embeddings exist in the DB — the in-process worker (imported via
 *  ../lib/queue) drains the queue in the background. */
async function waitForQueueDrain(businessId: string, expectedImages: number, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const counts = await productImageQueue.getJobCounts();
    const inDb = await db
      .select({ count: productImageEmbedding.id })
      .from(productImageEmbedding)
      .where(eq(productImageEmbedding.businessId, businessId));

    const done = counts.active === 0 && counts.waiting === 0 && counts.delayed === 0 && inDb.length >= expectedImages;
    if (done) {
      return { counts, embeddingsInDb: inDb.length };
    }
    await sleep(2000);
  }
  throw new Error("Timed out waiting for product-images queue to drain.");
}

async function main() {
  const args = process.argv.slice(2);
  const businessId = args.find((a) => !a.startsWith("--")) ?? DEFAULT_BUSINESS_ID;
  const force = args.includes("--force");

  if (force) {
    const existing = await db.select({ id: product.id }).from(product).where(eq(product.businessId, businessId));
    if (existing.length > 0) {
      console.log(`[Seed] Deleting ${existing.length} existing product(s) for ${businessId} (cascade: variants + embeddings)...`);
      for (const p of existing) {
        await db.delete(product).where(eq(product.id, p.id));
      }
    }
  }

  const existing = await db.select({ id: product.id }).from(product).where(eq(product.businessId, businessId));
  if (existing.length > 0) {
    console.log(`[Seed] Business ${businessId} already has ${existing.length} product(s).`);
    console.log("[Seed] Use --force to delete existing products and re-seed.");
    return;
  }

  // Pre-clean any leftover product-image jobs from prior runs so we don't index stale images.
  await productImageQueue.drain();

  let productsCreated = 0;
  let variantsCreated = 0;
  let expectedImages = 0;

  console.log(`[Seed] Seeding ${SEED_PRODUCTS.length} products for business ${businessId}...`);

  for (const seed of SEED_PRODUCTS) {
    const normalized = toNormalized(seed);
    const newProduct = await createProductFromNormalized(
      {
        db,
        businessId,
        actorUserId: "seed",
        actorName: "Seed Script",
      },
      { normalized, gender: seed.gender, lowStockThreshold: 5 },
    );

    productsCreated += 1;
    variantsCreated += normalized.variants.length;
    // createProductFromNormalized queues one embedding job per product image that
    // isn't already the image of a variant (dedupe by the same isVariantImage logic).
    expectedImages += normalized.images.length;

    console.log(`  ✓ ${newProduct.title} (${newProduct.id})`);
  }

  console.log(`\n[Seed] ${productsCreated} products + ${variantsCreated} variants inserted.`);
  console.log(`[Seed] Waiting for ${expectedImages} image-embedding jobs to drain (in-process worker)...`);

  const { counts, embeddingsInDb } = await waitForQueueDrain(businessId, expectedImages);
  console.log(`[Seed] Queue drained. Final counts:`, counts);
  console.log(`  productImageEmbedding rows for business: ${embeddingsInDb}`);

  await productImageWorker.close();
  await productImageQueue.close();

  console.log("\n[Seed] Done!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Seed] Failed:", err);
    process.exit(1);
  });
