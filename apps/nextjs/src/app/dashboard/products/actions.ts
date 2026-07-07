"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { product, productVariant } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import {
  addProductImageToVectorDb,
  deleteProductImageFromVectorDb,
  searchProductsByImage,
} from "~/lib/chromadb";

export interface VariantInput {
  id?: string;
  title: string;
  option1?: string;
  option2?: string;
  option3?: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  inventoryQuantity: number;
  imageUrl?: string;
}

export interface ProductInput {
  id?: string;
  title: string;
  description?: string;
  status: string;
  images: string[];
  options: { name: string; values: string[] }[];
  variants: VariantInput[];
}

export async function createProduct(input: ProductInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // 1. Insert product
  const [newProduct] = await db
    .insert(product)
    .values({
      userId,
      title: input.title,
      description: input.description,
      status: input.status,
      images: input.images,
      options: input.options,
    })
    .returning();

  if (!newProduct) {
    throw new Error("Failed to create product");
  }

  // 2. Insert variants
  if (input.variants && input.variants.length > 0) {
    const variantsToInsert = input.variants.map((v) => ({
      productId: newProduct.id,
      title: v.title,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      sku: v.sku ?? null,
      inventoryQuantity: v.inventoryQuantity,
      imageUrl: v.imageUrl ?? null,
    }));

    const insertedVariants = await db
      .insert(productVariant)
      .values(variantsToInsert)
      .returning();

    // 3. Index in ChromaDB
    // Index variant-specific images
    for (const variant of insertedVariants) {
      if (variant.imageUrl) {
        await addProductImageToVectorDb({
          userId,
          productId: newProduct.id,
          variantId: variant.id,
          imageUrl: variant.imageUrl,
          productTitle: `${newProduct.title} (${variant.title})`,
        });
      }
    }
  }

  // Index gallery images that aren't variant-specific
  if (input.images && input.images.length > 0) {
    for (const imgUrl of input.images) {
      // Check if this image was already indexed as a variant image
      const isVariantImage = input.variants.some((v) => v.imageUrl === imgUrl);
      if (!isVariantImage) {
        await addProductImageToVectorDb({
          userId,
          productId: newProduct.id,
          imageUrl: imgUrl,
          productTitle: newProduct.title,
        });
      }
    }
  }

  revalidatePath("/dashboard/products");
  return newProduct;
}

export async function updateProduct(input: ProductInput) {
  const session = await getSession();
  if (!session || !input.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const productId = input.id;

  // 1. Verify ownership and update product details
  const [updatedProduct] = await db
    .update(product)
    .set({
      title: input.title,
      description: input.description,
      status: input.status,
      images: input.images,
      options: input.options,
    })
    .where(and(eq(product.id, productId), eq(product.userId, userId)))
    .returning();

  if (!updatedProduct) {
    throw new Error("Product not found or unauthorized");
  }

  // 2. Fetch existing variants to know what to delete / update
  const existingVariants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, productId));

  const existingVariantIds = existingVariants.map((v) => v.id);
  const inputVariantIds = input.variants.map((v) => v.id).filter(Boolean) as string[];

  // Delete removed variants
  const variantsToDelete = existingVariants.filter((v) => !inputVariantIds.includes(v.id));
  if (variantsToDelete.length > 0) {
    const idsToDelete = variantsToDelete.map((v) => v.id);
    await db
      .delete(productVariant)
      .where(inArray(productVariant.id, idsToDelete));

    // Delete associated vector indices
    for (const v of variantsToDelete) {
      await deleteProductImageFromVectorDb({ variantId: v.id });
    }
  }

  // Update existing variants and Insert new ones
  for (const v of input.variants) {
    if (v.id && existingVariantIds.includes(v.id)) {
      // Update
      const [updated] = await db
        .update(productVariant)
        .set({
          title: v.title,
          option1: v.option1 ?? null,
          option2: v.option2 ?? null,
          option3: v.option3 ?? null,
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? null,
          sku: v.sku ?? null,
          inventoryQuantity: v.inventoryQuantity,
          imageUrl: v.imageUrl ?? null,
        })
        .where(eq(productVariant.id, v.id))
        .returning();

      if (updated && updated.imageUrl) {
        // Re-index variant image
        await addProductImageToVectorDb({
          userId,
          productId,
          variantId: updated.id,
          imageUrl: updated.imageUrl,
          productTitle: `${updatedProduct.title} (${updated.title})`,
        });
      } else if (v.id) {
        // If imageUrl was removed, delete it from vector DB
        await deleteProductImageFromVectorDb({ variantId: v.id });
      }
    } else {
      // Insert new
      const [inserted] = await db
        .insert(productVariant)
        .values({
          productId,
          title: v.title,
          option1: v.option1 ?? null,
          option2: v.option2 ?? null,
          option3: v.option3 ?? null,
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? null,
          sku: v.sku ?? null,
          inventoryQuantity: v.inventoryQuantity,
          imageUrl: v.imageUrl ?? null,
        })
        .returning();

      if (inserted && inserted.imageUrl) {
        await addProductImageToVectorDb({
          userId,
          productId,
          variantId: inserted.id,
          imageUrl: inserted.imageUrl,
          productTitle: `${updatedProduct.title} (${inserted.title})`,
        });
      }
    }
  }

  // Sync remaining product gallery images in ChromaDB
  // First, clear all product-level (non-variant-specific) image vectors
  await deleteProductImageFromVectorDb({ productId });

  // Re-index remaining images
  if (input.images && input.images.length > 0) {
    for (const imgUrl of input.images) {
      const isVariantImage = input.variants.some((v) => v.imageUrl === imgUrl);
      if (!isVariantImage) {
        await addProductImageToVectorDb({
          userId,
          productId,
          imageUrl: imgUrl,
          productTitle: updatedProduct.title,
        });
      }
    }
  }

  revalidatePath("/dashboard/products");
  return updatedProduct;
}

export async function deleteProduct(productId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  const [deleted] = await db
    .delete(product)
    .where(and(eq(product.id, productId), eq(product.userId, userId)))
    .returning();

  if (deleted) {
    // Delete vector index
    await deleteProductImageFromVectorDb({ productId });
  }

  revalidatePath("/dashboard/products");
  return deleted;
}

export async function testImageSearch(imageUrl: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // Search in ChromaDB
  const matches = await searchProductsByImage({
    userId,
    imageUrl,
    limit: 5,
  });

  if (matches.length === 0) {
    return [];
  }

  // Fetch full details of the matched products
  const productIds = Array.from(new Set(matches.map((m) => m.productId)));
  const products = await db
    .select()
    .from(product)
    .where(and(inArray(product.id, productIds), eq(product.userId, userId)));

  // Join product details to matches
  return matches.map((match) => {
    const prod = products.find((p) => p.id === match.productId);
    return {
      ...match,
      product: prod ?? null,
    };
  });
}
