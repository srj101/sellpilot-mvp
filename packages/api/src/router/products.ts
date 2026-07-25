import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray } from "@acme/db";
import { product, productVariant } from "@acme/db/schema";

import { deleteProductImageFromVectorDb, searchProductsByImage } from "../lib/chromadb";
import { queueProductImageIndexing } from "../lib/queue";
import { businessScopedProcedure } from "../trpc";

const VariantInput = z.object({
  id: z.string().optional(),
  title: z.string(),
  option1: z.string().optional(),
  option2: z.string().optional(),
  option3: z.string().optional(),
  price: z.number(),
  compareAtPrice: z.number().optional(),
  sku: z.string().optional(),
  inventoryQuantity: z.number(),
  imageUrl: z.string().optional(),
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
});

export const productsRouter = {
  list: businessScopedProcedure.query(async ({ ctx }) => {
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

    return { products, variants };
  }),

  create: businessScopedProcedure.input(ProductInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.businessOwnerId;
    const businessId = ctx.businessId;

    const [newProduct] = await ctx.db
      .insert(product)
      .values({
        userId,
        businessId,
        title: input.title,
        description: input.description,
        category: input.category,
        status: input.status,
        images: input.images,
        options: input.options,
        rating: input.rating ?? null,
      })
      .returning();

    if (!newProduct) {
      throw new Error("Failed to create product");
    }

    if (input.variants.length > 0) {
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

    for (const imgUrl of input.images) {
      const isVariantImage = input.variants.some((v) => v.imageUrl === imgUrl);
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

  update: businessScopedProcedure.input(ProductInput).mutation(async ({ ctx, input }) => {
    if (!input.id) {
      throw new Error("Missing product id");
    }
    const businessId = ctx.businessId;
    const productId = input.id;

    const [updatedProduct] = await ctx.db
      .update(product)
      .set({
        title: input.title,
        description: input.description,
        category: input.category,
        status: input.status,
        images: input.images,
        options: input.options,
        rating: input.rating ?? null,
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
    const inputVariantIds = input.variants.map((v) => v.id).filter((id): id is string => Boolean(id));

    const variantsToDelete = existingVariants.filter((v) => !inputVariantIds.includes(v.id));
    if (variantsToDelete.length > 0) {
      await ctx.db.delete(productVariant).where(inArray(productVariant.id, variantsToDelete.map((v) => v.id)));
      for (const v of variantsToDelete) {
        void deleteProductImageFromVectorDb({ variantId: v.id });
      }
    }

    for (const v of input.variants) {
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
            imageUrl: v.imageUrl ?? null,
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
            imageUrl: v.imageUrl ?? null,
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

    for (const imgUrl of input.images) {
      const isVariantImage = input.variants.some((v) => v.imageUrl === imgUrl);
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

  delete: businessScopedProcedure.input(z.object({ productId: z.string() })).mutation(async ({ ctx, input }) => {
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

  testImageSearch: businessScopedProcedure
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

  bulkCreate: businessScopedProcedure
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

      // Note: A transaction is ideal here, but to avoid complexity we insert one by one
      // In a real production scenario, use db.transaction
      const results = [];
      for (const p of input.products) {
        const compareAtPrice = p.discountPercent 
          ? p.price / (1 - p.discountPercent / 100) 
          : undefined;

        const [newProduct] = await ctx.db
          .insert(product)
          .values({
            userId,
            businessId,
            title: p.title,
            description: p.description,
            category: p.category,
            status: "active",
            images: [],
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
            imageUrl: p.imageUrl ?? null,
          });
          results.push(newProduct);
        }
      }
      return { count: results.length };
    }),
} satisfies TRPCRouterRecord;
