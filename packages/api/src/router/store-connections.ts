import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { storeConnection } from "@acme/db/schema";

import { encryptCredentials } from "../lib/store-import";
import { testProviderConnection } from "../lib/store-import";
import type { StoreProvider } from "../lib/store-import";
import { enqueueActivityLog } from "../lib/activity-queue";
import { ownerOnlyProcedure, permissionProcedure } from "../trpc";

const ShopifyCreds = z.object({
  accessToken: z.string().min(1, "Access token is required."),
});
const WooCreds = z.object({
  consumerKey: z.string().min(1, "Consumer key is required."),
  consumerSecret: z.string().min(1, "Consumer secret is required."),
});

/** Masked credential hints returned to the UI — never the secret itself. */
function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

function credentialsToStore(
  provider: StoreProvider,
  storeUrl: string,
  creds: { accessToken?: string; consumerKey?: string; consumerSecret?: string },
): Record<string, string> {
  if (provider === "shopify") {
    return { storeUrl, accessToken: creds.accessToken ?? "" };
  }
  return { storeUrl, consumerKey: creds.consumerKey ?? "", consumerSecret: creds.consumerSecret ?? "" };
}

async function getConnectionOrThrow(
  db: typeof Db,
  businessId: string,
  connectionId: string,
) {
  const [conn] = await db
    .select()
    .from(storeConnection)
    .where(and(eq(storeConnection.id, connectionId), eq(storeConnection.businessId, businessId)))
    .limit(1);
  if (!conn) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store connection not found." });
  }
  return conn;
}

export const storeConnectionsRouter = {
  /** All store connections for this business, without credentials. */
  list: permissionProcedure("integrations", "view").query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(storeConnection)
      .where(eq(storeConnection.businessId, ctx.businessId))
      .orderBy(desc(storeConnection.connectedAt));

      return rows.map((r) => {
        return {
          id: r.id,
          provider: r.provider as StoreProvider,
          storeUrl: r.storeUrl,
          storeName: r.storeName,
          status: r.status,
          connectedAt: r.connectedAt,
          lastSyncAt: r.lastSyncAt,
          credentialHint:
            r.provider === "shopify"
              ? { token: mask(r.credentials.encrypted.slice(-8)) }
              : { consumerKey: mask(r.credentials.encrypted.slice(-8)) },
        };
      });
    }),

  /** Live validation of provided credentials WITHOUT persisting — powers the "Test & Connect" flow. */
  test: ownerOnlyProcedure
    .input(
      z.object({
        provider: z.enum(["shopify", "woocommerce"]),
        storeUrl: z.string().min(1, "Store URL is required."),
        credentials: z.union([ShopifyCreds, WooCreds]),
      }),
    )
    .mutation(async ({ input }) => {
      return testProviderConnection(input.provider, {
        storeUrl: input.storeUrl,
        ...("accessToken" in input.credentials
          ? { accessToken: input.credentials.accessToken }
          : {
              consumerKey: input.credentials.consumerKey,
              consumerSecret: input.credentials.consumerSecret,
            }),
      });
    }),

  /**
   * Validates live then upserts the single-per-provider connection. Reconnecting a
   * provider overwrites its row (the UI requires an explicit disconnect first, but
   * upsert keeps us safe from unique-constraint races).
   */
  connect: ownerOnlyProcedure
    .input(
      z.object({
        provider: z.enum(["shopify", "woocommerce"]),
        storeUrl: z.string().min(1, "Store URL is required."),
        credentials: z.union([ShopifyCreds, WooCreds]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await testProviderConnection(input.provider, {
        storeUrl: input.storeUrl,
        ...("accessToken" in input.credentials
          ? { accessToken: input.credentials.accessToken }
          : {
              consumerKey: input.credentials.consumerKey,
              consumerSecret: input.credentials.consumerSecret,
            }),
      });

      const values = {
        provider: input.provider,
        storeUrl: result.storeUrl,
        storeName: result.storeName,
        credentials: encryptCredentials(
          credentialsToStore(input.provider, input.storeUrl, {
            ...("accessToken" in input.credentials ? { accessToken: input.credentials.accessToken } : {}),
            ...("consumerKey" in input.credentials
              ? {
                  consumerKey: input.credentials.consumerKey,
                  consumerSecret: input.credentials.consumerSecret,
                }
              : {}),
          }),
        ),
        status: "active",
        connectedAt: new Date(),
      };

      const [row] = await ctx.db
        .insert(storeConnection)
        .values({ businessId: ctx.businessId, ...values })
        .onConflictDoUpdate({
          target: [storeConnection.businessId, storeConnection.provider],
          set: {
            ...values,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save the connection." });
      }

      const actorName = ctx.session.user.name;
      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName,
        actorType: "staff",
        action: "integration.connect",
        entityType: "store_connection",
        entityId: row.id,
        summary: `${actorName} connected ${input.provider === "shopify" ? "Shopify" : "WooCommerce"} store ${result.storeName}`,
      });

      return { ok: true as const, connectionId: row.id };
    }),

  /** Removes the connection (and cascades its productImport links). */
  disconnect: ownerOnlyProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getConnectionOrThrow(ctx.db, ctx.businessId, input.connectionId);
      await ctx.db
        .delete(storeConnection)
        .where(and(eq(storeConnection.id, input.connectionId), eq(storeConnection.businessId, ctx.businessId)));

      const actorName = ctx.session.user.name;
      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName,
        actorType: "staff",
        action: "integration.disconnect",
        entityType: "store_connection",
        entityId: conn.id,
        summary: `${actorName} disconnected ${conn.provider === "shopify" ? "Shopify" : "WooCommerce"} store ${conn.storeName ?? conn.storeUrl}`,
      });

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
