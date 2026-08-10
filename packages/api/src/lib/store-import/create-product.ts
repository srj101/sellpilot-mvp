import { product, productVariant } from "@acme/db/schema";
import type { db as Db } from "@acme/db/client";

import type { NormalizedProduct } from "./types";
import { processImageUrl } from "../s3";
import { queueProductImageIndexing } from "../queue";

export interface CreateProductInput {
  normalized: NormalizedProduct;
  /** Optional batch defaults applied to every product/variant in an import. */
  gender?: "men" | "women" | "unisex" | "kids" | null;
  lowStockThreshold?: number;
}

export interface CreateProductContext {
  db: typeof Db;
  businessId: string;
  actorUserId: string;
  actorName: string;
}

/**
 * Insert one normalized product + variants, migrating images into S3 and queueing
 * embedding indexing. Returns the created product (with id). Shared by the manual
 * create/update paths' shape and the store-import path so both produce identical rows.
 */
export async function createProductFromNormalized(
  ctx: CreateProductContext,
  input: CreateProductInput,
): Promise<typeof product.$inferSelect> {
  const { normalized, gender, lowStockThreshold } = input;

  const processedImages: string[] = [];
  for (const img of normalized.images) {
    const s3Url = await processImageUrl(img, ctx.businessId, "products");
    if (s3Url) processedImages.push(s3Url);
  }

  const processedVariants = await Promise.all(
    normalized.variants.map(async (v) => ({
      ...v,
      imageUrl: v.imageUrl ? (await processImageUrl(v.imageUrl, ctx.businessId, "products")) ?? null : null,
    })),
  );

  const [newProduct] = await ctx.db
    .insert(product)
    .values({
      businessId: ctx.businessId,
      title: normalized.title,
      description: normalized.description,
      category: normalized.category,
      gender: gender ?? null,
      status: normalized.status,
      images: processedImages,
      options: normalized.options,
      rating: normalized.rating,
      lowStockThreshold: lowStockThreshold ?? 5,
    })
    .returning();

  if (!newProduct) throw new Error("Failed to create imported product.");

  if (processedVariants.length > 0) {
    const variantsToInsert = processedVariants.map((v) => ({
      productId: newProduct.id,
      title: v.title,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      sku: v.sku,
      inventoryQuantity: v.inventoryQuantity,
      lowStockThreshold: lowStockThreshold ?? 5,
      imageUrl: v.imageUrl,
    }));

    const insertedVariants = await ctx.db.insert(productVariant).values(variantsToInsert).returning();

    for (const variant of insertedVariants) {
      if (variant.imageUrl) {
        queueProductImageIndexing({
          businessId: ctx.businessId,
          productId: newProduct.id,
          variantId: variant.id,
          imageUrl: variant.imageUrl,
          productTitle: `${newProduct.title} (${variant.title})`,
        });
      }
    }
  }

  for (const imgUrl of processedImages) {
    const isVariantImage = processedVariants.some((v) => v.imageUrl === imgUrl);
    if (!isVariantImage) {
      queueProductImageIndexing({
        businessId: ctx.businessId,
        productId: newProduct.id,
        imageUrl: imgUrl,
        productTitle: newProduct.title,
      });
    }
  }

  return newProduct;
}
