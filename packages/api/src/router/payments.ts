import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, ilike, or, lt } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { businessProfile, order, transaction } from "@acme/db/schema";

import {
  hasCredentials,
  initiateRefund,
  probeActiveGateways,
  queryRefundStatus,
  type SslcommerzCredentials,
} from "../lib/sslcommerz";
import { ownerOnlyProcedure, permissionProcedure } from "../trpc";

export interface GatewayStatus {
  status: "unchecked" | "checked" | "error";
  bkash: boolean;
  nagad: boolean;
  card: boolean;
  internetBanking: boolean;
  checkedAt: string;
  error?: string;
}

/** Runs probeActiveGateways and shapes its result for storage on businessProfile.sslcommerzGatewayStatus. */
async function probeAndShape(storeId: string, storePassword: string, businessId: string): Promise<GatewayStatus> {
  const result = await probeActiveGateways({ storeId, storePassword }, businessId);
  const checkedAt = new Date().toISOString();
  if (!result.ok) {
    return { status: "error", bkash: false, nagad: false, card: false, internetBanking: false, checkedAt, error: result.reason };
  }
  return { status: "checked", bkash: result.bkash, nagad: result.nagad, card: result.card, internetBanking: result.internetBanking, checkedAt };
}

const DAY = 86_400_000;
const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;

function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function inWindow(ms: number, start: number, end: number) {
  return ms >= start && ms < end;
}

/**
 * Shape of what we keep in `transaction.provider_payload`: the original gateway response
 * (an allow-list captured at payment time, see sslcommerz.ts's validatePayment) plus an
 * append-only log of refund attempts. Refunds are appended rather than overwritten so a
 * partial-refund history and any failed attempt stay auditable.
 */
interface TransactionPayload {
  bank_tran_id?: string;
  refunds?: {
    refundTransId: string;
    refundRefId?: string;
    amount: number;
    status: "processing" | "refunded" | "failed";
    at: string;
  }[];
  [key: string]: unknown;
}

/** This business's own SSLCommerz credentials — never the platform's (see sslcommerz.ts). */
async function getBusinessCredentials(
  db: typeof Db,
  businessId: string,
): Promise<SslcommerzCredentials | null> {
  const profile = await db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, businessId) });
  const creds = {
    storeId: profile?.sslcommerzStoreId ?? undefined,
    storePassword: profile?.sslcommerzStorePassword ?? undefined,
  };
  return hasCredentials(creds) ? creds : null;
}

/**
 * The business's own customer-payment ledger (spec §5.2) — distinct from SellPilot's
 * own SaaS billing in router/subscription.ts. See billing plan D3.
 */
export const paymentsRouter = {
  /** Per-rail (bKash/Nagad/card) connection status, sourced from the cached result of the
   * last probeActiveGateways call — never a live SSLCommerz call on page load, see
   * sslcommerzGatewayStatus's doc comment in agent-schema.ts. `gateway` is null until
   * credentials are saved and probed at least once (updateGatewayCredentials/
   * refreshGatewayStatus below). Per-business — each business's own SSLCommerz store,
   * see checkout.ts. */
  getGatewayStatus: permissionProcedure("payments", "view").query(async ({ ctx }) => {
    const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
    return {
      hasCredentials: hasCredentials({
        storeId: profile?.sslcommerzStoreId ?? undefined,
        storePassword: profile?.sslcommerzStorePassword ?? undefined,
      }),
      gateway: profile?.sslcommerzGatewayStatus ?? null,
      cod: true,
    };
  }),

  /** This business's own SSLCommerz store — owner-only, since it's a real merchant
   * credential. Never returns the password itself, just whether one's set. */
  getGatewayCredentials: ownerOnlyProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
    return {
      storeId: profile?.sslcommerzStoreId ?? "",
      hasPassword: Boolean(profile?.sslcommerzStorePassword),
    };
  }),

  updateGatewayCredentials: ownerOnlyProcedure
    .input(
      z.object({
        storeId: z.string().min(1),
        // Optional: leave blank on an update to keep the existing stored password.
        storePassword: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
      const storePassword = input.storePassword?.trim() || profile?.sslcommerzStorePassword || null;

      // Best-effort probe — a network hiccup here shouldn't block saving valid credentials.
      const gatewayStatus = storePassword
        ? await probeAndShape(input.storeId, storePassword, ctx.businessId).catch(
            (err): GatewayStatus => ({
              status: "error",
              bkash: false,
              nagad: false,
              card: false,
              internetBanking: false,
              checkedAt: new Date().toISOString(),
              error: err instanceof Error ? err.message : "Gateway verification failed.",
            }),
          )
        : null;

      await ctx.db
        .update(businessProfile)
        .set({ sslcommerzStoreId: input.storeId, sslcommerzStorePassword: storePassword, sslcommerzGatewayStatus: gatewayStatus })
        .where(eq(businessProfile.businessId, ctx.businessId));
      return { success: true };
    }),

  /** Manually re-runs the gateway probe against the currently-stored credentials, without
   * changing them — powers the Payments page's "Test Connection" button. */
  refreshGatewayStatus: ownerOnlyProcedure.mutation(async ({ ctx }) => {
    const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
    if (!hasCredentials({ storeId: profile?.sslcommerzStoreId ?? undefined, storePassword: profile?.sslcommerzStorePassword ?? undefined })) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save your SSLCommerz credentials first." });
    }
    const gatewayStatus = await probeAndShape(profile!.sslcommerzStoreId!, profile!.sslcommerzStorePassword!, ctx.businessId);
    await ctx.db.update(businessProfile).set({ sslcommerzGatewayStatus: gatewayStatus }).where(eq(businessProfile.businessId, ctx.businessId));
    return gatewayStatus;
  }),

  getSummary: permissionProcedure("payments", "view")
    .input(
      z.object({
        range: z.enum(["7d", "30d", "90d", "1y", "custom"]).default("30d"),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = Date.now();

      let windowStart: number;
      let windowEnd: number;
      if (input.range === "custom" && input.from && input.to) {
        windowStart = new Date(input.from).setHours(0, 0, 0, 0);
        windowEnd = new Date(input.to).setHours(0, 0, 0, 0) + DAY;
      } else {
        const rangeDays = RANGE_DAYS[input.range === "custom" ? "30d" : input.range];
        windowEnd = now;
        windowStart = now - rangeDays * DAY;
      }
      const windowMs = windowEnd - windowStart;
      const prevStart = windowStart - windowMs;
      const prevEnd = windowStart;

      const rows = await ctx.db.select().from(transaction).where(eq(transaction.businessId, ctx.businessId));
      const current = rows.filter((r) => inWindow(r.createdAt.getTime(), windowStart, windowEnd));
      const previous = rows.filter((r) => inWindow(r.createdAt.getTime(), prevStart, prevEnd));

      const sumBy = (list: typeof rows, pred: (r: (typeof rows)[number]) => boolean, field: "amount" | "deliveryCharge" | "refundedAmount") =>
        list.filter(pred).reduce((acc, r) => acc + r[field], 0);

      const totalCollected = sumBy(current, (r) => r.status === "success", "amount");
      const prevCollected = sumBy(previous, (r) => r.status === "success", "amount");

      const pendingCodRows = current.filter((r) => r.method === "cod" && r.status === "pending");
      const pendingCod = pendingCodRows.reduce((a, r) => a + r.amount, 0);

      const deliveryChargesCollected = sumBy(current, (r) => r.status === "success", "deliveryCharge");
      const prevDeliveryCharges = sumBy(previous, (r) => r.status === "success", "deliveryCharge");

      const refunds = sumBy(current, (r) => r.refundedAmount > 0, "refundedAmount");
      const prevRefunds = sumBy(previous, (r) => r.refundedAmount > 0, "refundedAmount");

      return {
        totalCollected,
        totalCollectedTrendPct: trendPct(totalCollected, prevCollected),
        pendingCod,
        pendingCodCount: pendingCodRows.length,
        deliveryChargesCollected,
        deliveryChargesTrendPct: trendPct(deliveryChargesCollected, prevDeliveryCharges),
        refunds,
        refundsTrendPct: trendPct(refunds, prevRefunds),
      };
    }),

  list: permissionProcedure("payments", "view")
    .input(
      z.object({
        method: z.enum(["bkash", "nagad", "card", "internetbank", "cod"]).optional(),
        status: z.enum(["success", "pending", "failed", "refunded", "refund_pending"]).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(transaction.businessId, ctx.businessId)];
      if (input.method) conditions.push(eq(transaction.method, input.method));
      if (input.status) conditions.push(eq(transaction.status, input.status));
      if (input.cursor) {
        conditions.push(lt(transaction.createdAt, new Date(input.cursor)));
      }
      if (input.search) {
        const term = `%${input.search}%`;
        const searchClause = or(
          ilike(transaction.reference, term),
          ilike(order.orderNumber, term),
          ilike(order.customerName, term),
          ilike(order.customerPhone, term),
        );
        if (searchClause) conditions.push(searchClause);
      }

      const limitPlusOne = (input.limit ?? 50) + 1;

      const transactions = await ctx.db
        .select({
          id: transaction.id,
          reference: transaction.reference,
          method: transaction.method,
          status: transaction.status,
          amount: transaction.amount,
          deliveryCharge: transaction.deliveryCharge,
          refundedAmount: transaction.refundedAmount,
          createdAt: transaction.createdAt,
          orderId: transaction.orderId,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          providerPayload: transaction.providerPayload,
        })
        .from(transaction)
        .leftJoin(order, eq(transaction.orderId, order.id))
        .where(and(...conditions))
        .orderBy(desc(transaction.createdAt))
        .limit(limitPlusOne);

      const hasMore = transactions.length > (input.limit ?? 50);
      const page = hasMore ? transactions.slice(0, input.limit ?? 50) : transactions;
      const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() : undefined;

      // Strip the raw gateway payload before it leaves the server — the UI only needs to
      // know whether an API refund is possible, not the gateway's internals. COD never had
      // a gateway leg; older gateway payments lack the bank_tran_id refunds key (docs G7).
      const items = page.map(({ providerPayload, ...rest }) => {
        const payload = (providerPayload ?? {}) as TransactionPayload;
        return {
          ...rest,
          canApiRefund: rest.method === "cod" ? false : Boolean(payload.bank_tran_id),
        };
      });

      return { items, nextCursor, hasMore };
    }),

  /**
   * Refund a transaction — partial refunds allowed, never more than was actually charged.
   *
   * ⚠️ THIS MOVES REAL MONEY for gateway-collected payments. The UI must confirm explicitly
   * before calling it.
   *
   * Two paths:
   * - **COD** — cash never passed through a gateway, so there is nothing to call. Records
   *   the refund in the ledger only; handing the cash back is physical.
   * - **Gateway** — calls SSLCommerz's refund API. Their refunds settle asynchronously, so
   *   a successful call means "accepted", not "the customer has their money": the row goes
   *   to `refund_pending` and only `syncRefundStatus` can move it to `refunded`.
   *
   * The ledger is only ever written AFTER the gateway accepts. A recorded refund the
   * gateway rejected is worse than none, because it tells the owner the customer was paid.
   */
  refund: permissionProcedure("payments", "edit")
    .input(z.object({ id: z.string(), amount: z.number().positive(), remarks: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(transaction)
        .where(and(eq(transaction.id, input.id), eq(transaction.businessId, ctx.businessId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });

      if (row.status === "refund_pending") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A refund on this transaction is still being processed by the gateway. Check its status before starting another.",
        });
      }
      if (row.status !== "success") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only successful transactions can be refunded." });
      }

      const newRefundedAmount = row.refundedAmount + input.amount;
      if (newRefundedAmount > row.amount) {
        const remaining = row.amount - row.refundedAmount;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Refund exceeds the ৳${remaining.toLocaleString()} still refundable on this ৳${row.amount.toLocaleString()} charge.`,
        });
      }

      const payload = (row.providerPayload ?? {}) as TransactionPayload;
      const fullyRefunded = newRefundedAmount >= row.amount;

      // COD: no gateway was ever involved, so there is nothing to call — the cash goes back
      // by hand. Recording it keeps the Payments summary honest.
      if (row.method === "cod") {
        await ctx.db
          .update(transaction)
          .set({
            refundedAmount: newRefundedAmount,
            refundedAt: new Date(),
            status: fullyRefunded ? "refunded" : "success",
          })
          .where(eq(transaction.id, input.id));
        return { ok: true as const, settlement: "recorded" as const };
      }

      const bankTranId = payload.bank_tran_id;
      if (!bankTranId) {
        // Payments taken before bank_tran_id was captured (see docs G7). The key cannot be
        // recovered from the val_id, so the API route is permanently closed for these.
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This payment predates automatic refund support and has no gateway refund reference. Refund it from your SSLCommerz merchant portal instead.",
        });
      }

      const credentials = await getBusinessCredentials(ctx.db, ctx.businessId);
      if (!credentials) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect your SSLCommerz credentials before issuing refunds." });
      }

      const refundTransId = `RF-${row.id.slice(0, 8)}-${Date.now().toString().slice(-8)}`;
      const result = await initiateRefund({
        credentials,
        bankTranId,
        amount: input.amount,
        refundTransId,
        remarks: input.remarks?.trim() || `Refund for transaction ${row.reference.slice(0, 20)}`,
      });

      if (!result.ok) {
        // Ledger deliberately untouched — see the doc comment above.
        console.error(`[payments.refund] gateway declined refund for ${row.id}:`, result.reason);
        throw new TRPCError({ code: "BAD_REQUEST", message: `The gateway declined this refund: ${result.reason}` });
      }

      const refunds = [
        ...(payload.refunds ?? []),
        {
          refundTransId,
          refundRefId: result.refundRefId,
          amount: input.amount,
          status: result.status,
          at: new Date().toISOString(),
        },
      ];

      await ctx.db
        .update(transaction)
        .set({
          refundedAmount: newRefundedAmount,
          refundedAt: new Date(),
          // `refund_pending` until the gateway confirms settlement. Only a fully-refunded,
          // already-settled refund may claim "refunded".
          status: result.status === "refunded" ? (fullyRefunded ? "refunded" : "success") : "refund_pending",
          providerPayload: { ...payload, refunds, last_refund_response: result.raw },
        })
        .where(eq(transaction.id, input.id));

      return { ok: true as const, settlement: result.status };
    }),

  /**
   * Resolves in-flight refunds for one transaction by asking the gateway. Needed because
   * SSLCommerz settles refunds asynchronously and sends no callback for them — without
   * this a row would sit in `refund_pending` forever.
   *
   * Owner-triggered for now; a periodic worker sweep over `refund_pending` rows is the
   * follow-up (see docs/PAYMENTS_BUILD_PLAN.md Phase 6b).
   */
  syncRefundStatus: permissionProcedure("payments", "edit")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(transaction)
        .where(and(eq(transaction.id, input.id), eq(transaction.businessId, ctx.businessId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });

      const payload = (row.providerPayload ?? {}) as TransactionPayload;
      const pending = (payload.refunds ?? []).filter((r) => r.status === "processing" && r.refundRefId);
      if (pending.length === 0) return { ok: true as const, status: row.status, changed: false };

      const credentials = await getBusinessCredentials(ctx.db, ctx.businessId);
      if (!credentials) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect your SSLCommerz credentials first." });
      }

      let changed = false;
      let reversedAmount = 0;
      const refunds = [...(payload.refunds ?? [])];

      for (const entry of pending) {
        const res = await queryRefundStatus(entry.refundRefId!, credentials);
        if (!res.ok || res.status === "processing") continue;

        const idx = refunds.findIndex((r) => r.refundTransId === entry.refundTransId);
        if (idx === -1) continue;
        refunds[idx] = { ...refunds[idx]!, status: res.status };
        changed = true;
        // A refund the gateway ultimately rejected must give its reserved amount back, or
        // the ledger permanently understates what is still refundable.
        if (res.status === "failed") reversedAmount += entry.amount;
      }

      if (!changed) return { ok: true as const, status: row.status, changed: false };

      const refundedAmount = Math.max(0, row.refundedAmount - reversedAmount);
      const stillProcessing = refunds.some((r) => r.status === "processing");
      const status = stillProcessing ? "refund_pending" : refundedAmount >= row.amount ? "refunded" : "success";

      await ctx.db
        .update(transaction)
        .set({ refundedAmount, status, providerPayload: { ...payload, refunds } })
        .where(eq(transaction.id, input.id));

      return { ok: true as const, status, changed: true };
    }),
} satisfies TRPCRouterRecord;
