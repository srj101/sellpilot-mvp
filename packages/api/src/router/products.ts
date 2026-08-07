import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray, sql } from "@acme/db";
import { product, productVariant, subscription } from "@acme/db/schema";

import { deleteProductImageFromVectorDb, searchProductsByImage } from "../lib/vector-search";
import { assertPlanLimit, getProductUsage } from "../lib/plan-limits";
import { queueProductImageIndexing } from "../lib/queue";
import { deleteS3Object, getPresignedUploadUrl, getPublicUrl, getS3ObjectSize, processImageUrl } from "../lib/s3";
import { getStockStatus } from "../lib/stock-status";
import { permissionProcedure } from "../trpc";

const VariantInput = z.object({
  id: z.string().optional(),
  title: z.string(),
  option1: z.string().optional(),
  option2: z.string().optional(),
  option3: z.string().optional(),
  price: z.number(),
  // Nullable, not just optional — product-form.tsx sends an explicit null (not undefined)
  // for these when the owner leaves them blank, matching the nullable DB columns.
  compareAtPrice: z.number().nullable().optional(),
  sku: z.string().nullable().optional(),
  inventoryQuantity: z.number(),
  lowStockThreshold: z.number().min(0).optional(),
  imageUrl: z.string().nullable().optional(),
});

const ProductInput = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: z.string(),
  images: z.array(z.string()),
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  variants: z.array(VariantInput),
  rating: z.number().int().min(1).max(5).optional(),
  lowStockThreshold: z.number().min(0).optional(),
});

export const productsRouter = {
  /** Powers the "X of Y products, Z remaining" banner shown above both the manual add
   * form and the CSV bulk importer, before either one hits assertPlanLimit at save time. */
  getUsage: permissionProcedure("products", "view").query(({ ctx }) => getProductUsage(ctx)),

  list: permissionProcedure("products", "view")
    .input(z.object({ filterStatus: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;
      const products = await ctx.db
        .select()
        .from(product)
        .where(eq(product.businessId, businessId))
        .orderBy(desc(product.createdAt));

      const variants =
        products.length > 0
          ? await ctx.db
              .select()
              .from(productVariant)
              .where(inArray(productVariant.productId, products.map((p) => p.id)))
          : [];

      const variantsWithStatus = variants.map((v) => ({
        ...v,
        stockStatus: getStockStatus(v.inventoryQuantity, v.lowStockThreshold ?? 5),
      }));

      const productsWithStatus = products.map((p) => {
        const pVariants = variantsWithStatus.filter((v) => v.productId === p.id);
        const totalQty = pVariants.length > 0
          ? pVariants.reduce((sum, v) => sum + v.inventoryQuantity, 0)
          : 0;
        const threshold = p.lowStockThreshold ?? 5;
        const stockStatus = getStockStatus(totalQty, threshold);

        return {
          ...p,
          totalInventoryQuantity: totalQty,
          stockStatus,
        };
      });

      const filter = input?.filterStatus ?? "all";
      const filteredProducts = filter === "all"
        ? productsWithStatus
        : productsWithStatus.filter((p) => p.stockStatus === filter);

      return { products: filteredProducts, variants: variantsWithStatus };
    }),

  create: permissionProcedure("products", "create").input(ProductInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.businessOwnerId;
    const businessId = ctx.businessId;

    await assertPlanLimit(ctx, "products");

    // Process all images: download external URLs / data URLs → upload to S3
    const processedImages: string[] = [];
    for (const img of input.images) {
      const s3Url = await processImageUrl(img, businessId, "products");
      if (s3Url) processedImages.push(s3Url);
    }

    // Process variant images
    const processedVariants = await Promise.all(
      input.variants.map(async (v) => ({
        ...v,
        imageUrl: v.imageUrl ? (await processImageUrl(v.imageUrl, businessId, "products")) ?? null : null,
      })),
    );

    const [newProduct] = await ctx.db
      .insert(product)
      .values({
        userId,
        businessId,
        title: input.title,
        description: input.description,
        category: input.category,
        status: input.status,
        images: processedImages,
        options: input.options,
        rating: input.rating ?? null,
        lowStockThreshold: input.lowStockThreshold ?? 5,
      })
      .returning();

    if (!newProduct) {
      throw new Error("Failed to create product");
    }

    if (processedVariants.length > 0) {
      const variantsToInsert = processedVariants.map((v) => ({
        productId: newProduct.id,
        title: v.title,
        option1: v.option1 ?? null,
        option2: v.option2 ?? null,
        option3: v.option3 ?? null,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        sku: v.sku ?? null,
        inventoryQuantity: v.inventoryQuantity,
        lowStockThreshold: v.lowStockThreshold ?? input.lowStockThreshold ?? 5,
        imageUrl: v.imageUrl,
      }));

      const insertedVariants = await ctx.db.insert(productVariant).values(variantsToInsert).returning();

      for (const variant of insertedVariants) {
        if (variant.imageUrl) {
          void queueProductImageIndexing({
            businessId,
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
        void queueProductImageIndexing({
          businessId,
          productId: newProduct.id,
          imageUrl: imgUrl,
          productTitle: newProduct.title,
        });
      }
    }

    return newProduct;
  }),

  update: permissionProcedure("products", "edit").input(ProductInput).mutation(async ({ ctx, input }) => {
    if (!input.id) {
      throw new Error("Missing product id");
    }
    const businessId = ctx.businessId;
    const productId = input.id;

    // Process all images: download external URLs / data URLs → upload to S3
    const processedImages: string[] = [];
    for (const img of input.images) {
      const s3Url = await processImageUrl(img, businessId, "products");
      if (s3Url) processedImages.push(s3Url);
    }

    // Process variant images
    const processedVariants = await Promise.all(
      input.variants.map(async (v) => ({
        ...v,
        imageUrl: v.imageUrl ? (await processImageUrl(v.imageUrl, businessId, "products")) ?? null : null,
      })),
    );

    const [updatedProduct] = await ctx.db
      .update(product)
      .set({
        title: input.title,
        description: input.description,
        category: input.category,
        status: input.status,
        images: processedImages,
        options: input.options,
        rating: input.rating ?? null,
        lowStockThreshold: input.lowStockThreshold ?? 5,
      })
      .where(and(eq(product.id, productId), eq(product.businessId, businessId)))
      .returning();

    if (!updatedProduct) {
      throw new Error("Product not found or unauthorized");
    }

    const existingVariants = await ctx.db
      .select()
      .from(productVariant)
      .where(eq(productVariant.productId, productId));

    const existingVariantIds = existingVariants.map((v) => v.id);
    const inputVariantIds = processedVariants.map((v) => v.id).filter((id): id is string => Boolean(id));

    const variantsToDelete = existingVariants.filter((v) => !inputVariantIds.includes(v.id));
    if (variantsToDelete.length > 0) {
      await ctx.db.delete(productVariant).where(inArray(productVariant.id, variantsToDelete.map((v) => v.id)));
      for (const v of variantsToDelete) {
        void deleteProductImageFromVectorDb({ variantId: v.id });
      }
    }

    for (const v of processedVariants) {
      if (v.id && existingVariantIds.includes(v.id)) {
        const [updated] = await ctx.db
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
            lowStockThreshold: v.lowStockThreshold ?? input.lowStockThreshold ?? 5,
            imageUrl: v.imageUrl,
          })
          .where(eq(productVariant.id, v.id))
          .returning();

        if (updated?.imageUrl) {
          void queueProductImageIndexing({
            businessId,
            productId,
            variantId: updated.id,
            imageUrl: updated.imageUrl,
            productTitle: `${updatedProduct.title} (${updated.title})`,
          });
        } else if (v.id) {
          void deleteProductImageFromVectorDb({ variantId: v.id });
        }
      } else {
        const [inserted] = await ctx.db
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
            lowStockThreshold: v.lowStockThreshold ?? input.lowStockThreshold ?? 5,
            imageUrl: v.imageUrl,
          })
          .returning();

        if (inserted?.imageUrl) {
          void queueProductImageIndexing({
            businessId,
            productId,
            variantId: inserted.id,
            imageUrl: inserted.imageUrl,
            productTitle: `${updatedProduct.title} (${inserted.title})`,
          });
        }
      }
    }

    void deleteProductImageFromVectorDb({ productId });

    for (const imgUrl of processedImages) {
      const isVariantImage = processedVariants.some((v) => v.imageUrl === imgUrl);
      if (!isVariantImage) {
        void queueProductImageIndexing({
          businessId,
          productId,
          imageUrl: imgUrl,
          productTitle: updatedProduct.title,
        });
      }
    }

    return updatedProduct;
  }),

  delete: permissionProcedure("products", "delete").input(z.object({ productId: z.string() })).mutation(async ({ ctx, input }) => {
    const businessId = ctx.businessId;

    const [deleted] = await ctx.db
      .delete(product)
      .where(and(eq(product.id, input.productId), eq(product.businessId, businessId)))
      .returning();

    if (deleted) {
      void deleteProductImageFromVectorDb({ productId: input.productId });
    }

    return deleted ?? null;
  }),

  testImageSearch: permissionProcedure("products", "view")
    .input(z.object({ imageUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const matches = await searchProductsByImage({ businessId, imageUrl: input.imageUrl, limit: 5 });
      if (matches.length === 0) {
        return [];
      }

      const productIds = Array.from(new Set(matches.map((m) => m.productId)));
      const products = await ctx.db
        .select()
        .from(product)
        .where(and(inArray(product.id, productIds), eq(product.businessId, businessId)));

      return matches.map((match) => ({
        ...match,
        product: products.find((p) => p.id === match.productId) ?? null,
      }));
    }),

  bulkCreate: permissionProcedure("products", "create")
    .input(z.object({
      products: z.array(z.object({
        title: z.string().min(1),
        category: z.string().optional(),
        price: z.number().positive(),
        discountPercent: z.number().min(0).max(100).optional(),
        stockQty: z.number().int().min(0),
        description: z.string().optional(),
        rating: z.number().int().min(1).max(5).optional(),
        imageUrl: z.string().optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;
      const userId = ctx.businessOwnerId;

      // Cap the batch at the plan's remaining capacity instead of rejecting the whole
      // import — keeps the first N rows in file order (matching the CSV importer's
      // preview truncation) rather than making the user re-upload a trimmed file.
      const usage = await getProductUsage(ctx);
      if (usage.remaining === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You've hit your ${usage.planName} product limit (${usage.limit}). Upgrade to import more.`,
        });
      }
      const accepted = input.products.slice(0, usage.remaining);
      const skipped = input.products.length - accepted.length;

      // Note: A transaction is ideal here, but to avoid complexity we insert one by one
      // In a real production scenario, use db.transaction
      const results = [];
      for (const p of accepted) {
        const compareAtPrice = p.discountPercent 
          ? p.price / (1 - p.discountPercent / 100) 
          : undefined;

        // Process image URL: download → S3 → get public URL
        const processedImageUrl = p.imageUrl
          ? await processImageUrl(p.imageUrl, businessId, "products")
          : null;

        const [newProduct] = await ctx.db
          .insert(product)
          .values({
            userId,
            businessId,
            title: p.title,
            description: p.description,
            category: p.category,
            status: "active",
            images: processedImageUrl ? [processedImageUrl] : [],
            options: [],
            rating: p.rating ?? null,
          })
          .returning();

        if (newProduct) {
          await ctx.db.insert(productVariant).values({
            productId: newProduct.id,
            title: "Default",
            price: p.price,
            compareAtPrice: compareAtPrice ? Math.round(compareAtPrice) : null,
            inventoryQuantity: p.stockQty,
            imageUrl: processedImageUrl,
          });

          // Queue image for embedding if present
          if (processedImageUrl) {
            void queueProductImageIndexing({
              businessId,
              productId: newProduct.id,
              imageUrl: processedImageUrl,
              productTitle: p.title,
            });
          }

          results.push(newProduct);
        }
      }
      return {
        count: results.length,
        imported: results.length,
        requested: input.products.length,
        skipped,
        limit: usage.limit,
        planName: usage.planName,
      };
    }),

  /**
   * Returns a presigned S3 URL for uploading a product image.
   * Checks plan storage capacity before issuing presigned URL.
   */
  getImageUploadUrl: permissionProcedure("products", "edit")
    .input(z.object({ contentType: z.string(), fileSize: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Pre-flight storage limit check (defaults to 5MB check if fileSize omitted)
      await assertPlanLimit(ctx, "storage", input.fileSize ?? 5 * 1024 * 1024);

      const ext = input.contentType.split("/")[1] ?? "jpg";
      const key = `businesses/${ctx.businessId}/products/${crypto.randomUUID()}.${ext}`;

      const uploadUrl = await getPresignedUploadUrl(key, input.contentType);
      const publicUrl = getPublicUrl(key);

      return { uploadUrl, publicUrl, key };
    }),

  /**
   * Confirms upload to S3 and atomically increments DB storageUsedBytes in real-time.
   */
  confirmUpload: permissionProcedure("products", "edit")
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sizeBytes = await getS3ObjectSize(input.key);

      if (sizeBytes > 0) {
        await ctx.db
          .update(subscription)
          .set({
            storageUsedBytes: sql`${subscription.storageUsedBytes} + ${sizeBytes}`,
          })
          .where(eq(subscription.businessId, ctx.businessId));
      }

      return { success: true, sizeBytes, publicUrl: getPublicUrl(input.key) };
    }),

  /**
   * Deletes image from S3 and atomically decrements DB storageUsedBytes in real-time.
   */
  deleteImage: permissionProcedure("products", "edit")
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sizeBytes = await getS3ObjectSize(input.key);
      await deleteS3Object(input.key);

      if (sizeBytes > 0) {
        await ctx.db
          .update(subscription)
          .set({
            storageUsedBytes: sql`GREATEST(0, ${subscription.storageUsedBytes} - ${sizeBytes})`,
          })
          .where(eq(subscription.businessId, ctx.businessId));
      }

      return { success: true, freedBytes: sizeBytes };
    }),
} satisfies TRPCRouterRecord;
