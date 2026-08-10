import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, inArray } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { productImport, storeConnection } from "@acme/db/schema";

import { decryptCredentials, listShopifyProducts, listWooCommerceProducts } from "../lib/store-import";
import type {
  NormalizedProduct,
  ShopifyCredentials,
  SourceProductSummary,
  StoreProvider,
  WooCommerceCredentials,
} from "../lib/store-import";
import { createProductFromNormalized } from "../lib/store-import/create-product";
import { getProductUsage } from "../lib/plan-limits";
import { enqueueActivityLog } from "../lib/activity-queue";
import { permissionProcedure } from "../trpc";

/** Provider-scoped fetch of normalized products, wrapped in a tiny 60s cache so the
 * picker re-render / checkbox toggling doesn't hammer the external store. */
const sourceCache = new Map<
  string,
  { at: number; products: NormalizedProduct[] }
>();

const CACHE_TTL_MS = 60_000;

async function fetchSourceProducts(
  db: typeof Db,
  connectionId: string,
  businessId: string,
  options: { onlyActive?: boolean } = {},
): Promise<{ provider: StoreProvider; products: NormalizedProduct[] }> {
  const [conn] = await db
    .select()
    .from(storeConnection)
    .where(and(eq(storeConnection.id, connectionId), eq(storeConnection.businessId, businessId)))
    .limit(1);
  if (!conn) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store connection not found." });
  }

  const cacheKey = `${connectionId}:${conn.provider}:${options.onlyActive ? "active" : "all"}`;
  const cached = sourceCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { provider: conn.provider as StoreProvider, products: cached.products };
  }

  const creds = decryptCredentials(conn.credentials);
  const storeUrl = conn.storeUrl;

  const products =
    conn.provider === "shopify"
      ? await listShopifyProducts(
          { storeUrl, accessToken: (creds as ShopifyCredentials).accessToken },
          options,
        )
      : await listWooCommerceProducts(
          {
            storeUrl,
            consumerKey: (creds as WooCommerceCredentials).consumerKey,
            consumerSecret: (creds as WooCommerceCredentials).consumerSecret,
          },
          options,
        );

  sourceCache.set(cacheKey, { at: Date.now(), products });
  return { provider: conn.provider as StoreProvider, products };
}

export const importsRouter = {
  /** List importable products from a connected store, with already-imported flags. */
  getSourceProducts: permissionProcedure("products", "view")
    .input(
      z.object({
        connectionId: z.string(),
        onlyActive: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { provider, products } = await fetchSourceProducts(ctx.db, input.connectionId, ctx.businessId, {
        onlyActive: input.onlyActive,
      });

      const alreadyImported = await ctx.db
        .select({ externalProductId: productImport.externalProductId })
        .from(productImport)
        .where(
          and(
            eq(productImport.connectionId, input.connectionId),
            eq(productImport.businessId, ctx.businessId),
            inArray(
              productImport.externalProductId,
              products.map((p) => p.externalProductId),
            ),
          ),
        );

      const importedIds = new Set(alreadyImported.map((r) => r.externalProductId));

      const summaries: SourceProductSummary[] = products.map((p) => ({
        externalProductId: p.externalProductId,
        title: p.title,
        category: p.category,
        status: p.status,
        images: p.images,
        options: p.options,
        rating: p.rating,
        variantCount: p.variants.length,
        alreadyImported: importedIds.has(p.externalProductId),
      }));

      return { products: summaries, provider };
    }),

  /**
   * Import selected external products. Server-side cap against the live plan's remaining
   * product slots (mirrors products.bulkCreate), skipping anything already imported.
   * imageUrl etc. migration happens in createProductFromNormalized.
   */
  importProducts: permissionProcedure("products", "create")
    .input(
      z.object({
        connectionId: z.string(),
        externalProductIds: z.array(z.string()).min(1).max(500),
        gender: z.enum(["men", "women", "unisex", "kids"]).nullable().optional(),
        lowStockThreshold: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { products } = await fetchSourceProducts(ctx.db, input.connectionId, ctx.businessId);

      const usage = await getProductUsage(ctx);
      if (usage.remaining === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You've hit your ${usage.planName} product limit (${usage.limit}). Upgrade to import more.`,
        });
      }

      const alreadyImported = await ctx.db
        .select({ externalProductId: productImport.externalProductId })
        .from(productImport)
        .where(
          and(
            eq(productImport.connectionId, input.connectionId),
            eq(productImport.businessId, ctx.businessId),
            inArray(productImport.externalProductId, input.externalProductIds),
          ),
        );
      const importedIds = new Set(alreadyImported.map((r) => r.externalProductId));

      // Preserve the picker's selection order, cap to remaining slots.
      const selected = products.filter(
        (p) => input.externalProductIds.includes(p.externalProductId) && !importedIds.has(p.externalProductId),
      );
      const accepted = selected.slice(0, usage.remaining);
      const skipped = selected.length - accepted.length;

      const created: { productId: string; externalProductId: string }[] = [];
      const actorName = ctx.session.user.name;
      for (const normalized of accepted) {
        const newProduct = await createProductFromNormalized(
          {
            db: ctx.db,
            businessId: ctx.businessId,
            actorUserId: ctx.session.user.id,
            actorName,
          },
          {
            normalized,
            gender: input.gender ?? null,
            lowStockThreshold: input.lowStockThreshold,
          },
        );

        await ctx.db.insert(productImport).values({
          businessId: ctx.businessId,
          connectionId: input.connectionId,
          productId: newProduct.id,
          externalProductId: normalized.externalProductId,
          externalVariantId: normalized.variants[0]?.externalVariantId ?? null,
        });

        created.push({ productId: newProduct.id, externalProductId: normalized.externalProductId });
      }

      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName,
        actorType: "staff",
        action: "product.import",
        entityType: "product",
        summary: `${actorName} imported ${created.length} product${created.length === 1 ? "" : "s"} from a connected store`,
      });

      // Drop stale cached listings so the picker reflects what's now imported.
      sourceCache.clear();

      return {
        count: created.length,
        imported: created.length,
        requested: input.externalProductIds.length,
        skipped,
        limit: usage.limit,
        planName: usage.planName,
      };
    }),
} satisfies TRPCRouterRecord;
