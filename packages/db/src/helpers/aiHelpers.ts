import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import { publishNotificationEvent } from "@acme/queue";

import {
  agentSession,
  businessProfile,
  cart,
  customer,
  faq,
  notification,
  notificationPreference,
  offer,
  order,
  orderItem,
  review,
  shippingRate,
} from "../agent-schema";
import { transaction } from "../billing-schema";
import { db } from "../client";
import { conversationMeta } from "../inbox-schema";
import { metaWebhookEvent } from "../meta-webhook-event-schema";
import { product, productVariant } from "../product-schema";
import { getNotificationPreference } from "./notification-preferences";

// Link a conversation thread to the CRM customer record created/updated for its order —
// conversations otherwise have no connection to `customer` rows (keyed by platform contact
// id, not phone/email), so this is the only point a thread gains contact details/tags/notes.
async function linkConversationToCustomer(
  userId: string,
  businessId: string,
  threadId: string,
  customerId: string,
) {
  await db
    .insert(conversationMeta)
    .values({ userId, businessId, threadId, customerId })
    .onConflictDoUpdate({
      target: [conversationMeta.businessId, conversationMeta.threadId],
      set: { customerId },
    });
}

/**
 * Records one business-wide in-app notification (dashboard bell icon) and pushes it
 * live over Redis pub/sub so it shows up in an open dashboard immediately — the single
 * call site every trigger point (checkout, manual/AI order creation, the
 * abandoned-follow-up sweep) uses, whether it runs in apps/nextjs or apps/worker. The
 * live-push is best-effort: a Redis hiccup must never undo or block the real action
 * (an order really was created, a payment really succeeded) just because the bell
 * couldn't be notified instantly — the row is already in the DB either way, so the
 * dashboard picks it up on next load regardless.
 */
export async function createNotification(params: {
  businessId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  const [created] = await db.insert(notification).values(params).returning();
  if (created) {
    publishNotificationEvent({
      businessId: created.businessId,
      notification: {
        id: created.id,
        type: created.type,
        title: created.title,
        body: created.body,
        link: created.link,
        read: created.read,
        createdAt: created.createdAt.toISOString(),
      },
    }).catch((err) => console.error("[createNotification] Failed to publish live update:", err));
  }
  return created;
}

// The customer already linked to this thread (set by linkConversationToCustomer above,
// the first time an order was placed in this conversation) — lets createCustomerAndOrder
// reuse a returning customer's name/phone/address on a second order in the same thread
// instead of the agent needing to ask again (and re-relying on values it only remembers
// from its own earlier reply text, the same reliability problem productId had).
export async function getCustomerForThread(businessId: string, threadId: string) {
  const [meta] = await db
    .select({ customerId: conversationMeta.customerId })
    .from(conversationMeta)
    .where(and(eq(conversationMeta.businessId, businessId), eq(conversationMeta.threadId, threadId)));
  if (!meta?.customerId) return null;

  const [cust] = await db.select().from(customer).where(eq(customer.id, meta.customerId));
  return cust ?? null;
}

// Bangladeshi mobile numbers only — the only country this store currently serves.
// Accepts local (01XXXXXXXXX) or international (+8801XXXXXXXXX / 8801XXXXXXXXX) input
// and normalizes both to +8801XXXXXXXXX, so upsertCustomerByPhone's exact-match lookup
// (and the DB's (businessId, phone) unique constraint) recognize the same customer
// across orders regardless of which format was typed — and so garbage input (a
// placeholder string instead of a real number) is rejected rather than silently stored.
function normalizeBdPhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  const match = digits.match(/^(?:\+?880|0)(1[3-9]\d{8})$/);
  return match ? `+880${match[1]}` : null;
}

// Helper: get top selling products by quantity (limit)
export async function getTopSellingProducts(businessId: string, limit = 5) {
  // Get orders for the store
  const orderRows = await db
    .select()
    .from(order)
    .where(eq(order.businessId, businessId));
  const orderIds = orderRows.map((o) => o.id);
  if (orderIds.length === 0) return [];

  const items = await db
    .select()
    .from(orderItem)
    .where(inArray(orderItem.orderId, orderIds));

  const qtyByProduct = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    qtyByProduct.set(
      item.productId,
      (qtyByProduct.get(item.productId) ?? 0) + item.qty,
    );
  }

  const sorted = Array.from(qtyByProduct.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([productId, qty]) => ({ productId, qty }));

  if (sorted.length === 0) return [];
  const ids = sorted.map((s) => s.productId);

  const products = await db
    .select()
    .from(product)
    .where(inArray(product.id, ids));

  // preserve order
  const ordered = ids
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({
      id: p!.id,
      title: p!.title,
      description: p!.description,
      images: p!.images ?? [],
      qtySold: qtyByProduct.get(p!.id) ?? 0,
    }));

  return ordered;
}

// Get product by id
export async function getProductById(businessId: string, id: string) {
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.id, id)));
  if (!p) return null;
  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, p.id));
  return { product: p, variants };
}

// List active products
export async function listActiveProducts(businessId: string, limit = 20) {
  return await db
    .select()
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.status, "active")))
    .limit(limit);
}

// Search products by keyword (simple)
export async function searchProductsByKeyword(
  businessId: string,
  keyword: string,
  limit = 10,
) {
  const rows = await db
    .select()
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.status, "active")));
  const normalized = keyword.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const matches = rows.filter((p) => {
    const t = (p.title ?? "").toLowerCase();
    const d = (p.description ?? "").toLowerCase();
    return words.every((w) => t.includes(w) || d.includes(w));
  });
  return matches.slice(0, limit);
}

// Get variants for a product
export async function getProductVariants(productId: string) {
  return await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, productId));
}

// Check stock for a product (sum of variants)
export async function checkProductStock(productId: string) {
  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, productId));
  const total = variants.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0);
  return { stock: total, variants };
}

function generateOrderNumber() {
  return `SP-${Date.now()}`;
}

/** Builds the public checkout link sent to the customer, e.g. https://app.sellpilot.ai/pay/{token} */
function buildPaymentLink() {
  const token = crypto.randomUUID();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return { paymentToken: token, paymentUrl: `${appUrl}/pay/${token}` };
}

function calculateDiscount(
  coupon: { type: string; value: number; minSubtotal: number } | undefined,
  subtotal: number,
): number {
  if (!coupon) return 0;
  if (subtotal < coupon.minSubtotal) return 0;
  if (coupon.type === "fixed") return Math.min(coupon.value, subtotal);
  return Math.floor((subtotal * coupon.value) / 100);
}

/** `active` alone used to be the only gate on a coupon — an offer past its `endDate` (or
 * before its `startDate`) but still flagged `active` would keep discounting real orders
 * forever. Both checkout paths below only ever load a coupon through this. */
function liveOfferWhere(businessId: string, code: string, now: Date) {
  return and(
    eq(offer.businessId, businessId),
    eq(offer.code, code),
    eq(offer.active, true),
    lte(offer.startDate, now),
    or(isNull(offer.endDate), gte(offer.endDate, now)),
  );
}

/** Matches a live combo offer for an exact product pair, in either order — a combo set up
 * as (A: panjabi, B: pajama) must still match when the order happens to list them the
 * other way round. Same active/date-range gate as liveOfferWhere, just keyed by product
 * pair instead of a typed code. */
function liveComboOfferWhere(businessId: string, productIdA: string, productIdB: string, now: Date) {
  return and(
    eq(offer.businessId, businessId),
    eq(offer.active, true),
    lte(offer.startDate, now),
    or(isNull(offer.endDate), gte(offer.endDate, now)),
    or(
      and(eq(offer.comboProductAId, productIdA), eq(offer.comboProductBId, productIdB)),
      and(eq(offer.comboProductAId, productIdB), eq(offer.comboProductBId, productIdA)),
    ),
  );
}

/**
 * Live combo offers involving this product — powers the AI's proactive "pair this with X
 * for ৳100 off" suggestion (spec §4.3's upselling example). Returns the partner product's
 * name so the agent doesn't need a second tool call just to know what to suggest.
 */
export async function getComboOffersForProduct(businessId: string, productId: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(offer)
    .where(
      and(
        eq(offer.businessId, businessId),
        eq(offer.active, true),
        lte(offer.startDate, now),
        or(isNull(offer.endDate), gte(offer.endDate, now)),
        or(eq(offer.comboProductAId, productId), eq(offer.comboProductBId, productId)),
      ),
    );
  if (rows.length === 0) return [];

  const partnerIds = rows
    .map((r) => (r.comboProductAId === productId ? r.comboProductBId : r.comboProductAId))
    .filter((id): id is string => Boolean(id));
  const partners = partnerIds.length
    ? await db.select({ id: product.id, title: product.title }).from(product).where(inArray(product.id, partnerIds))
    : [];
  const partnerById = new Map(partners.map((p) => [p.id, p.title]));

  return rows.map((r) => {
    const partnerId = r.comboProductAId === productId ? r.comboProductBId : r.comboProductAId;
    return {
      offerId: r.id,
      title: r.title,
      type: r.type,
      value: r.value,
      partnerProductId: partnerId,
      partnerProductName: partnerId ? (partnerById.get(partnerId) ?? null) : null,
    };
  });
}

/**
 * Live offers flagged for proactive, unprompted mention (festival/seasonal campaigns) —
 * B.7. Distinct from getComboOffersForProduct (product-triggered) and getOfferByCode
 * (customer-triggered): the agent surfaces these on its own initiative, so tier-gating
 * and the "limited" targeting rule are applied by the calling tool, not here.
 */
export async function getActiveCampaigns(businessId: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(offer)
    .where(
      and(
        eq(offer.businessId, businessId),
        eq(offer.isCampaign, true),
        eq(offer.active, true),
        lte(offer.startDate, now),
        or(isNull(offer.endDate), gte(offer.endDate, now)),
      ),
    )
    .orderBy(desc(offer.createdAt));

  return rows.map((r) => ({
    offerId: r.id,
    title: r.title,
    description: r.description,
    code: r.code,
    type: r.type,
    value: r.value,
    minSubtotal: r.minSubtotal,
  }));
}

/**
 * Whether this thread's linked customer has any prior order with this business — powers
 * Growth's "limited (most-purchased customers only)" campaign-mention rule. Same
 * thread→customer resolution as getCustomerPurchaseHistory, just a cheap existence check
 * instead of fetching the list.
 */
export async function hasPriorPurchases(businessId: string, threadId: string): Promise<boolean> {
  const [meta] = await db
    .select({ customerId: conversationMeta.customerId })
    .from(conversationMeta)
    .where(and(eq(conversationMeta.businessId, businessId), eq(conversationMeta.threadId, threadId)));
  if (!meta?.customerId) return false;

  const [row] = await db
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.businessId, businessId), eq(order.customerId, meta.customerId)))
    .limit(1);
  return Boolean(row);
}

// Shipping cost for a district, falling back to the business's default shipping cost.
export async function getShippingCost(businessId: string, district?: string) {
  if (district) {
    const [rate] = await db
      .select()
      .from(shippingRate)
      .where(
        and(
          eq(shippingRate.businessId, businessId),
          eq(shippingRate.district, district),
          eq(shippingRate.active, true),
        ),
      );
    if (rate) return { cost: rate.cost, estimatedDays: rate.estimatedDays };
  }
  const profile = await getBusinessProfile(businessId);
  return { cost: profile?.defaultShippingCost ?? 0, estimatedDays: null as number | null };
}

// Find or update a customer by phone instead of blindly inserting — repeat customers
// would otherwise crash on the (businessId, phone) unique constraint.
async function upsertCustomerByPhone(
  userId: string,
  businessId: string,
  data: { name: string; phone: string; address: string },
) {
  const [existing] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.businessId, businessId), eq(customer.phone, data.phone)));

  if (existing) {
    const [updated] = await db
      .update(customer)
      .set({ name: data.name, address: data.address })
      .where(eq(customer.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [inserted] = await db
    .insert(customer)
    .values({ userId, businessId, name: data.name, phone: data.phone, address: data.address })
    .returning();
  return inserted;
}

/** Shared by quoteOrder and createCustomerAndOrder for both the main item and the
 * optional combo partner — avoids fetching/validating a product+variant four separate
 * ways across the two functions. */
async function resolveProductVariant(businessId: string, productId: string, variantId?: string) {
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.id, productId)));
  if (!p) return { error: "Product not found" as const, product: null, variant: null };

  const variants = await db.select().from(productVariant).where(eq(productVariant.productId, p.id));
  const variant = variantId ? variants.find((v) => v.id === variantId) : variants[0];
  if (!variant) return { error: "Variant not found" as const, product: p, variant: null };

  return { error: null, product: p, variant };
}

export interface CartItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface ResolvedLineItem {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  inventoryQuantity: number;
  lowStockThreshold: number;
  quantity: number;
  lineTotal: number;
}

/** Shared by quoteOrder and createCustomerAndOrder — resolves every line item, sums the
 * subtotal, and applies whichever discount rule fits: exactly two items checks for a live
 * combo offer on that exact pair (a combo and a typed coupon never stack); anything else
 * falls back to a flat offerCode discount against the whole subtotal. Combo offers are
 * inherently pairwise (offer.comboProductAId/comboProductBId), so they only ever apply to
 * a 2-item cart — 3+ items is a plain multi-product order, coupon-only. */
async function resolveAndPriceItems(
  businessId: string,
  items: CartItemInput[],
  offerCode?: string,
): Promise<{ items: ResolvedLineItem[]; subtotal: number; discountAmount: number; error?: string }> {
  const resolved: ResolvedLineItem[] = [];
  for (const it of items) {
    const r = await resolveProductVariant(businessId, it.productId, it.variantId);
    if (r.error) {
      const label = r.product?.title ? `"${r.product.title}"` : `product ${it.productId}`;
      return { items: [], subtotal: 0, discountAmount: 0, error: `${label}: ${r.error}` };
    }
    resolved.push({
      productId: r.product.id,
      variantId: r.variant.id,
      productTitle: r.product.title,
      variantTitle: r.variant.title,
      imageUrl: r.variant.imageUrl ?? r.product.images?.[0] ?? null,
      unitPrice: r.variant.price,
      compareAtPrice: r.variant.compareAtPrice ?? null,
      inventoryQuantity: r.variant.inventoryQuantity ?? 0,
      lowStockThreshold: r.variant.lowStockThreshold ?? r.product.lowStockThreshold ?? 5,
      quantity: it.quantity,
      lineTotal: r.variant.price * it.quantity,
    });
  }

  const subtotal = resolved.reduce((sum, i) => sum + i.lineTotal, 0);

  let discountAmount = 0;
  if (resolved.length === 2) {
    const [comboOffer] = await db
      .select()
      .from(offer)
      .where(liveComboOfferWhere(businessId, resolved[0]!.productId, resolved[1]!.productId, new Date()));
    discountAmount = calculateDiscount(comboOffer, subtotal);
  } else if (offerCode) {
    const [coupon] = await db.select().from(offer).where(liveOfferWhere(businessId, offerCode, new Date()));
    discountAmount = calculateDiscount(coupon, subtotal);
  }

  return { items: resolved, subtotal, discountAmount };
}

// Price a cart of one or more line items — unit prices, combo/coupon discount, shipping,
// and total. Use this instead of having the model do price arithmetic itself.
export async function quoteOrder(params: {
  businessId: string;
  items: CartItemInput[];
  district?: string;
  offerCode?: string;
}) {
  const { businessId, items, district, offerCode } = params;
  const priced = await resolveAndPriceItems(businessId, items, offerCode);
  if (priced.error) {
    return {
      items: [] as ResolvedLineItem[],
      subtotal: 0,
      discountAmount: 0,
      shippingCost: 0,
      estimatedShippingDays: null as number | null,
      total: 0,
      currency: "USD",
      error: priced.error,
    };
  }

  const { cost: shippingCost, estimatedDays } = await getShippingCost(businessId, district);
  const total = Math.max(0, priced.subtotal + shippingCost - priced.discountAmount);
  const profile = await getBusinessProfile(businessId);

  return {
    items: priced.items,
    subtotal: priced.subtotal,
    discountAmount: priced.discountAmount,
    shippingCost,
    estimatedShippingDays: estimatedDays,
    total,
    currency: profile?.currency ?? "USD",
  };
}

// Create a customer + order with one or more line items.
export async function createCustomerAndOrder(params: {
  userId: string;
  businessId: string;
  threadId: string;
  channel: string;
  items: CartItemInput[];
  /** Omit any of these three for a returning customer already linked to this
   * conversation (from an earlier order in the same thread) — missing ones are filled
   * in automatically from that record. Required if this is the first order in this
   * conversation, or to update what's on file (e.g. a new delivery address). */
  customerName?: string;
  phone?: string;
  address?: string;
  district?: string;
  offerCode?: string;
  /** "cod" = order is inserted already confirmed, cash collected at delivery — mirrors
   * checkout.ts's confirmCod end state exactly. "online"/undefined = today's behavior
   * (pending, payment link). */
  paymentMethod?: "cod" | "online";
}) {
  const { userId, businessId, threadId, channel, items, district, offerCode, paymentMethod } = params;
  let { customerName, phone, address } = params;

  if (items.length === 0) return { success: false, error: "No items to order" };

  const priced = await resolveAndPriceItems(businessId, items, offerCode);
  if (priced.error) return { success: false, error: priced.error };

  const insufficient = priced.items.find((i) => i.inventoryQuantity < i.quantity);
  if (insufficient) return { success: false, error: `Insufficient stock: ${insufficient.productTitle}` };

  // Reuse the customer already linked to this conversation (from an earlier order in
  // the same thread) for whichever of name/phone/address were omitted, instead of
  // requiring the agent to re-ask for — or worse, re-guess from memory — details it
  // already collected once (the same reliability problem productId had).
  if (!customerName || !phone || !address) {
    const existing = await getCustomerForThread(businessId, threadId);
    customerName = customerName || existing?.name || undefined;
    phone = phone || existing?.phone || undefined;
    address = address || existing?.address || undefined;
  }

  if (!customerName || !phone || !address) {
    return { success: false, error: "Missing customer details: name, phone, and address are all required." };
  }

  const normalizedPhone = normalizeBdPhone(phone);
  if (!normalizedPhone) {
    return {
      success: false,
      error: "Invalid phone number — must be a valid Bangladeshi mobile number, e.g. 01XXXXXXXXX or +8801XXXXXXXXX.",
    };
  }

  const cust = await upsertCustomerByPhone(userId, businessId, { name: customerName, phone: normalizedPhone, address });
  if (!cust) return { success: false, error: "Unable to create customer" };

  const { subtotal, discountAmount } = priced;
  const { cost: shippingCost } = await getShippingCost(businessId, district);
  const total = Math.max(0, subtotal + shippingCost - discountAmount);
  // Generated regardless of paymentMethod — cheap, and a COD order still benefits from
  // having a live link on file if the customer changes their mind later.
  const { paymentToken, paymentUrl } = buildPaymentLink();
  const isCod = paymentMethod === "cod";
  // A combo-offer discount (exactly 2 items) is never a typed coupon — same distinction
  // the old main/combo code made via couponCode: combo?.variant ? null : offerCode.
  const isComboDiscount = priced.items.length === 2 && discountAmount > 0 && !offerCode;

  const [created] = await db
    .insert(order)
    .values({
      userId,
      businessId,
      customerId: cust.id,
      orderNumber: generateOrderNumber(),
      // Mirrors checkout.ts's confirmCod end state exactly for "cod" — the customer
      // already told us in chat, no need to make them click the link and choose again.
      status: isCod ? "confirmed" : "pending",
      paymentMethod: isCod ? "cod" : null,
      subtotal,
      shippingCost,
      discountAmount,
      total,
      customerName,
      customerPhone: phone,
      shippingAddress: address,
      shippingDistrict: district ?? null,
      couponCode: isComboDiscount ? null : (offerCode ?? null),
      channel,
      threadId,
      paymentToken,
      paymentUrl,
    })
    .returning();
  if (!created) return { success: false, error: "Unable to create order" };

  if (isCod) {
    // Same shape as confirmCod's transaction insert — "pending" in the ledger, not
    // "success": the cash hasn't actually changed hands yet, it's collected at delivery.
    await db.insert(transaction).values({
      businessId,
      orderId: created.id,
      reference: created.orderNumber,
      method: "cod",
      status: "pending",
      amount: total,
      deliveryCharge: shippingCost,
    });
  }

  const lowStockAlerts: { name: string; remaining: number; threshold: number; variantId: string }[] = [];

  for (const item of priced.items) {
    await db.insert(orderItem).values({
      orderId: created.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.productTitle,
      variantTitle: item.variantTitle,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      imageUrl: item.imageUrl,
    });

    const newQty = item.inventoryQuantity - item.quantity;
    await db
      .update(productVariant)
      .set({ inventoryQuantity: newQty })
      .where(eq(productVariant.id, item.variantId));

    // FR-SET-04: detect low-stock after decrement — callers send email/in-app
    const threshold = item.lowStockThreshold ?? 5;
    if (newQty >= 0 && newQty <= threshold) {
      lowStockAlerts.push({
        name: item.productTitle,
        remaining: newQty,
        threshold,
        variantId: item.variantId,
      });
    }
  }

  await linkConversationToCustomer(userId, businessId, threadId, cust.id);

  // FR-SET-04: gate in-app notification on inAppEnabled preference
  const { inAppEnabled } = await getNotificationPreference(businessId, "new_order");
  if (inAppEnabled) {
    const itemsSummary = priced.items.map((i) => `${i.productTitle} × ${i.quantity}`).join(", ");
    await createNotification({
      businessId,
      type: "order_created",
      title: `New order #${created.orderNumber}`,
      body: `${itemsSummary} — ৳${created.total.toLocaleString()} (${customerName})`,
      link: "/dashboard/orders",
    }).catch((err) => console.error("[createCustomerAndOrder] Failed to create notification:", err));
  }

  // Mark this thread's session as no longer "abandoned mid-purchase" — RECOVERABLE_STEPS
  // in the abandoned-follow-up sweep excludes "order_placed" specifically so a customer
  // who already completed their order doesn't get nudged about it afterward. Without
  // this, the session would stay stuck at "cart_active" forever.
  try {
    const [session] = await db
      .select({ id: agentSession.id, state: agentSession.state })
      .from(agentSession)
      .where(and(eq(agentSession.businessId, businessId), eq(agentSession.threadId, threadId)));
    if (session) {
      await db
        .update(agentSession)
        .set({ state: { ...session.state, currentStep: "order_placed" } })
        .where(eq(agentSession.id, session.id));
    }
  } catch (err) {
    console.error("[createCustomerAndOrder] Failed to mark session as order_placed:", err);
  }

  // Best-effort: the matching cart (if any — quoteOrder may never have been called, e.g.
  // a repeat customer who just re-orders) moves out of "active" so the abandoned-cart
  // sweep never targets an already-converted order.
  try {
    await db
      .update(cart)
      .set({ status: "converted", convertedOrderId: created.id })
      .where(and(eq(cart.userId, userId), eq(cart.threadId, threadId), eq(cart.status, "active")));
  } catch (err) {
    console.error("[createCustomerAndOrder] Failed to mark cart converted:", err);
  }

  return {
    success: true,
    orderId: created.id,
    orderNumber: created.orderNumber,
    paymentUrl: created.paymentUrl ?? undefined,
    paymentMethod: isCod ? ("cod" as const) : ("online" as const),
    total: created.total,
    lowStockAlerts,
  };
}

// Orders tied to the current conversation thread only — never other customers' orders.
export async function getOrdersForThread(businessId: string, threadId: string) {
  const rows = await db
    .select()
    .from(order)
    .where(and(eq(order.businessId, businessId), eq(order.threadId, threadId)))
    .orderBy(desc(order.createdAt));
  if (rows.length === 0) return [];

  const orderIds = rows.map((o) => o.id);
  const items = await db.select().from(orderItem).where(inArray(orderItem.orderId, orderIds));

  return rows.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total,
    paymentUrl: o.paymentUrl,
    createdAt: o.createdAt,
    // The actual delivery details used for this order — without these, the agent has no
    // real way to answer "what name/phone/address did I use last time?" and (confirmed
    // happening) will guess/fabricate an answer instead of admitting it doesn't know.
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    shippingAddress: o.shippingAddress,
    shippingDistrict: o.shippingDistrict,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ name: i.name, variantTitle: i.variantTitle, qty: i.qty, lineTotal: i.lineTotal })),
  }));
}

/**
 * Most recent delivered order on this thread that hasn't been reviewed yet — the order
 * the agent should attach a customer's feedback to when they reply with a review
 * (submitReview below), whether or not the review-request sweep prompted it.
 */
export async function getPendingReviewOrder(businessId: string, threadId: string) {
  const [pending] = await db
    .select({ id: order.id, orderNumber: order.orderNumber, customerId: order.customerId })
    .from(order)
    .where(and(eq(order.businessId, businessId), eq(order.threadId, threadId), eq(order.status, "delivered")))
    .orderBy(desc(order.deliveredAt));
  if (!pending) return null;

  const [existingReview] = await db.select({ id: review.id }).from(review).where(eq(review.orderId, pending.id));
  if (existingReview) return null;

  const [firstItem] = await db.select({ productId: orderItem.productId }).from(orderItem).where(eq(orderItem.orderId, pending.id)).limit(1);

  return { orderId: pending.id, orderNumber: pending.orderNumber, customerId: pending.customerId, productId: firstItem?.productId ?? null };
}

/** Stores a customer's review against a specific delivered order — the `review` table
 * itself is the collection mechanism (spec §6 "Review & Feedback Collection"), no
 * separate dashboard surface exists for it yet. */
export async function submitReview(params: {
  userId: string;
  orderId: string;
  customerId: string | null;
  productId: string | null;
  rating: number;
  comment?: string;
}): Promise<void> {
  await db.insert(review).values(params);
}

/**
 * Finds the most recent still-`pending` order for this thread and confirms it as COD —
 * for a customer who already has a payment link (from earlier in this same conversation)
 * but says in chat they want cash on delivery instead of using it. Mirrors checkout.ts's
 * confirmCod mutation exactly (same status/paymentMethod/transaction shape), since this
 * is the same state transition just triggered from chat instead of the /pay/[token] page.
 */
export async function confirmCodForThread(businessId: string, threadId: string) {
  const [pendingOrder] = await db
    .select()
    .from(order)
    .where(and(eq(order.businessId, businessId), eq(order.threadId, threadId), eq(order.status, "pending")))
    .orderBy(desc(order.createdAt))
    .limit(1);

  if (!pendingOrder) {
    return { success: false, error: "No pending order found for this conversation to confirm as COD." };
  }

  await db.update(order).set({ status: "confirmed", paymentMethod: "cod" }).where(eq(order.id, pendingOrder.id));

  // Same as confirmCod's transaction insert — "pending" in the ledger, cash collected at delivery.
  await db.insert(transaction).values({
    businessId,
    orderId: pendingOrder.id,
    reference: pendingOrder.orderNumber,
    method: "cod",
    status: "pending",
    amount: pendingOrder.total,
    deliveryCharge: pendingOrder.shippingCost,
  });

  return { success: true, orderNumber: pendingOrder.orderNumber, total: pendingOrder.total };
}

/**
 * THIS SAME customer's own orders across every conversation/channel they've used with
 * this business — not scoped to a single thread, unlike getOrdersForThread above. Gated
 * by plan (Growth: recent 3, Pro: full history) at the tool layer, not here — this
 * always returns everything up to `limit`. Resolves the customer via conversationMeta's
 * thread→customer link (populated once any order has been placed in this thread), so it
 * never surfaces another customer's data — if this thread hasn't been linked yet, there's
 * simply no history to return.
 */
export async function getCustomerPurchaseHistory(businessId: string, threadId: string, limit: number | null) {
  const [meta] = await db
    .select({ customerId: conversationMeta.customerId })
    .from(conversationMeta)
    .where(and(eq(conversationMeta.businessId, businessId), eq(conversationMeta.threadId, threadId)));
  if (!meta?.customerId) return [];

  const rows = await db
    .select({ orderNumber: order.orderNumber, status: order.status, total: order.total, createdAt: order.createdAt })
    .from(order)
    .where(and(eq(order.businessId, businessId), eq(order.customerId, meta.customerId)))
    .orderBy(desc(order.createdAt))
    .limit(limit ?? 200); // hard ceiling even for Pro's "unlimited" tier, to avoid a pathological result size

  return rows;
}

// Get customer by phone
export async function getCustomerByPhone(businessId: string, phone: string) {
  // Normalize first so a customer typing a different valid format (local vs +880) than
  // whatever was stored still matches — falls back to the raw input if it doesn't look
  // like a valid BD number, so this never gets stricter than the caller's own intent.
  const normalized = normalizeBdPhone(phone) ?? phone;
  const [c] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.businessId, businessId), eq(customer.phone, normalized)));
  return c ?? null;
}

// Get business profile
export async function getBusinessProfile(businessId: string) {
  const [b] = await db
    .select()
    .from(businessProfile)
    .where(eq(businessProfile.businessId, businessId));
  return b ?? null;
}

/**
 * Whether a staff member has taken this specific thread over from the AI (FR-AGT-15).
 * Called by the worker right before generating a reply — not just at webhook-receipt time
 * — since a takeover can happen while a reply job is already queued; checking again here
 * closes that race instead of letting an in-flight AI reply slip out after a human already
 * jumped in. No conversationMeta row at all means it's never been touched, i.e. still "ai".
 */
export async function getConversationHandlingMode(businessId: string, threadId: string): Promise<"ai" | "human"> {
  const [meta] = await db
    .select({ handlingMode: conversationMeta.handlingMode })
    .from(conversationMeta)
    .where(and(eq(conversationMeta.businessId, businessId), eq(conversationMeta.threadId, threadId)));
  return meta?.handlingMode === "human" ? "human" : "ai";
}

/**
 * Auto-escalation (FR-AGT-15) — hands a thread over to human handling the same way the
 * dashboard's manual "Take over" button does (inbox.ts's setHandlingMode), just triggered
 * by the agent itself (reportComplaint/reportBulkInquiry tools) instead of a staff click.
 * Takes effect starting with the customer's NEXT message — dm-reply.ts already checks
 * handling mode before generating each reply, so this turn's own reply still completes.
 */
export async function escalateToHuman(userId: string, businessId: string, threadId: string, reason: string): Promise<void> {
  await db
    .insert(conversationMeta)
    .values({ userId, businessId, threadId, handlingMode: "human" })
    .onConflictDoUpdate({
      target: [conversationMeta.businessId, conversationMeta.threadId],
      set: { handlingMode: "human" },
    });

  // FR-SET-04: gate in-app notification on inAppEnabled preference
  const { inAppEnabled } = await getNotificationPreference(businessId, "human_handoff");
  if (inAppEnabled) {
    await createNotification({
      businessId,
      type: "complaint_escalated",
      title: "Conversation escalated to you",
      body: reason,
      link: "/dashboard/inbox",
    }).catch((err) => console.error("[escalateToHuman] Failed to create notification:", err));
  }
}

/** Pro tier's "basic logging + alert" (spec §6 Complaint/Return/Refund Handling) — the AI
 * keeps handling the conversation itself; this just makes sure the owner sees it. The
 * notification row IS the log — no separate complaints table for a "basic" tier. */
export async function logComplaint(businessId: string, customerName: string | undefined, note: string): Promise<void> {
  await createNotification({
    businessId,
    type: "complaint_logged",
    title: "Complaint logged",
    body: customerName ? `${customerName}: ${note}` : note,
    link: "/dashboard/inbox",
  });
}

/** Pro tier's "automated + contact routing" (spec §6 Bulk/Wholesale Inquiry Handling) —
 * alerts the owner and hands the agent the store's own support contact to relay directly,
 * rather than escalating the thread. Reuses businessProfile's existing support fields
 * instead of a dedicated wholesale-contact column — nothing in the spec asks for a
 * separate one. */
export async function routeBulkInquiry(
  businessId: string,
  threadId: string,
  customerName: string | undefined,
  note: string,
): Promise<{ contactEmail: string | null; contactPhone: string | null }> {
  const [profile] = await db
    .select({ supportEmail: businessProfile.supportEmail, supportPhone: businessProfile.supportPhone })
    .from(businessProfile)
    .where(eq(businessProfile.businessId, businessId));

  await createNotification({
    businessId,
    type: "bulk_inquiry_routed",
    title: "Bulk/wholesale inquiry",
    body: customerName ? `${customerName}: ${note}` : note,
    link: "/dashboard/inbox",
  }).catch((err) => console.error("[routeBulkInquiry] Failed to create notification:", err));

  return { contactEmail: profile?.supportEmail ?? null, contactPhone: profile?.supportPhone ?? null };
}

// Get offer by code
export async function getOfferByCode(businessId: string, code: string) {
  const [o] = await db
    .select()
    .from(offer)
    .where(and(eq(offer.businessId, businessId), eq(offer.code, code)));
  if (!o) return null;

  // Computed here, not left to the model to work out from raw start/end dates — the AI
  // tool result is the only thing standing between an expired offer and the agent telling
  // a customer it's still live (checkout itself is gated separately via liveOfferWhere).
  const now = new Date();
  const isCurrentlyValid = o.active && o.startDate <= now && (!o.endDate || o.endDate >= now);
  return { ...o, isCurrentlyValid };
}

// Get FAQ by query (simple)
export async function getFAQMatches(businessId: string, query: string, limit = 5) {
  const rows = await db.select().from(faq).where(eq(faq.businessId, businessId));
  const q = query.trim().toLowerCase();
  const matches = rows.filter(
    (r) =>
      (r.question ?? "").toLowerCase().includes(q) ||
      (r.answer ?? "").toLowerCase().includes(q),
  );
  return matches.slice(0, limit);
}

// Get low stock products using dynamic lowStockThreshold settings
export async function getLowStockProducts(businessId: string, threshold?: number) {
  const variants = await db.select().from(productVariant);
  const products = await db.select().from(product);
  const prodById = new Map(products.map((p) => [p.id, p]));
  const low = variants
    .filter((v) => {
      const p = prodById.get(v.productId);
      if (!p || p.businessId !== businessId) return false;
      const effectiveThreshold = threshold ?? v.lowStockThreshold ?? p.lowStockThreshold ?? 5;
      return (v.inventoryQuantity ?? 0) <= effectiveThreshold;
    })
    .map((v) => {
      const p = prodById.get(v.productId);
      const effectiveThreshold = threshold ?? v.lowStockThreshold ?? p?.lowStockThreshold ?? 5;
      return {
        ...v,
        productTitle: p?.title,
        lowStockThreshold: effectiveThreshold,
        stockStatus: (v.inventoryQuantity ?? 0) <= 0 ? "out_of_stock" : "low_stock",
      };
    });
  return low.slice(0, 100);
}

// Get products by category/tag (assumes product.metadata or tags)
export async function getProductsByTag(
  businessId: string,
  tag: string,
  limit = 10,
) {
  const rows = await db
    .select()
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.status, "active")));
  const matches = rows.filter((p) =>
    ((p as any).metadata?.tags ?? []).includes(tag),
  );
  return matches.slice(0, limit);
}

// Best-effort extraction of the human-readable text from a stored webhook
// payload, across the platform-specific shapes we actually receive.
function extractMessageText(rawPayload: Record<string, unknown>): string | null {
  try {
    const entry = (rawPayload.entry as any[])?.[0];
    // Facebook Page / Instagram Messenger shape
    const messengerText = entry?.messaging?.[0]?.message?.text;
    if (typeof messengerText === "string" && messengerText) return messengerText;

    // WhatsApp Cloud API shape
    const waText =
      entry?.changes?.[0]?.value?.messages?.[0]?.text?.body;
    if (typeof waText === "string" && waText) return waText;
  } catch {
    // fall through
  }
  return null;
}

// Recent conversation turns for a single thread, oldest first — used to give
// the AI agent short-term memory across messages in the same conversation.
export async function getConversationHistory(
  businessId: string,
  threadId: string,
  limit = 15,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select()
    .from(metaWebhookEvent)
    .where(
      and(
        eq(metaWebhookEvent.businessId, businessId),
        eq(metaWebhookEvent.threadId, threadId),
      ),
    )
    .orderBy(desc(metaWebhookEvent.receivedAt))
    .limit(limit);

  return rows
    .reverse()
    .map((row) => {
      if (row.eventType === "outbound") {
        const text = (row.rawPayload as { text?: string })?.text;
        return text ? { role: "assistant" as const, content: text } : null;
      }
      const text = extractMessageText(row.rawPayload);
      return text ? { role: "user" as const, content: text } : null;
    })
    .filter((m): m is { role: "user" | "assistant"; content: string } => m !== null);
}

// Cached AI-generated 2-3 sentence summary of the conversation (conversationMeta.summary)
// — read by the agent as older-than-the-raw-window memory, and shown in the inbox's
// Conversation Summary sidebar section. Written by generateAndSaveConversationSummary.
export async function getConversationSummary(businessId: string, threadId: string): Promise<string | null> {
  const [meta] = await db
    .select({ summary: conversationMeta.summary })
    .from(conversationMeta)
    .where(and(eq(conversationMeta.businessId, businessId), eq(conversationMeta.threadId, threadId)));
  return meta?.summary ?? null;
}

/**
 * Summarizes the last 20 turns of a conversation in 2-3 sentences via a cheap, separate
 * LLM call, and caches the result on conversationMeta — the one thing the agent's raw
 * 15-message history window can't cover (something said 15+ messages ago, e.g. an
 * allergy or a complaint, that's since scrolled out of view). Called two ways:
 *   - Fire-and-forget by the worker after each AI reply is sent (apps/worker/src/
 *     handlers/dm-reply.ts) — keeps the cache at most one turn stale, never blocks the
 *     customer's actual reply.
 *   - Directly by the dashboard's "Regenerate" button (packages/api/src/router/
 *     inbox.ts's generateSummary), for an on-demand refresh.
 * Never throws — a summarization hiccup must never break either caller's real job.
 */
export async function generateAndSaveConversationSummary(
  userId: string,
  businessId: string,
  threadId: string,
): Promise<string | null> {
  try {
    const history = await getConversationHistory(businessId, threadId, 20);
    if (history.length === 0) return null;

    const transcript = history
      .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`)
      .join("\n")
      .slice(0, 8000);

    const apiKey = process.env.OPENAI_API_KEY ?? "";
    const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "Summarize this customer service conversation in 2-3 short sentences for a merchant dashboard. Focus on what the customer wants, any important details they mentioned (allergies, preferences, complaints), and the current status.",
          },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const summary = data.choices[0]?.message?.content?.trim();
    if (!summary) return null;

    await db
      .insert(conversationMeta)
      .values({ userId, businessId, threadId, summary, summaryGeneratedAt: new Date() })
      .onConflictDoUpdate({
        target: [conversationMeta.businessId, conversationMeta.threadId],
        set: { summary, summaryGeneratedAt: new Date() },
      });

    return summary;
  } catch (err) {
    console.error(`[aiHelpers] Failed to generate conversation summary for ${threadId}:`, err);
    return null;
  }
}

const CHANNEL_FROM_PLATFORM: Record<string, string> = {
  facebook_page: "messenger",
  instagram: "instagram",
  whatsapp: "whatsapp",
};

export interface ActiveCartItem {
  productId: string;
  /** Matches cart.items' column type exactly (packages/db/src/agent-schema.ts) — optional
   * there, though in practice always populated by the time upsertActiveCart is called
   * (quoteOrder always resolves a concrete variant before returning). */
  variantId?: string;
  name: string;
  variantTitle?: string;
  qty: number;
  unitPrice: number;
  imageUrl?: string;
}

/**
 * Records the full set of items the customer just got a real price for as the thread's
 * active cart (the `cart` table — see its schema comment) — powers the abandoned-cart
 * follow-up job (apps/worker/src/handlers/conversation-followup.ts), which otherwise has
 * nothing to reference. Replaces (not appends) the cart's item list each call, since
 * quoteOrder is always called with the customer's full current selection, not a delta.
 *
 * Also upserts the agentSession row — unrelated to cart storage now, but nothing else in
 * the live DM flow creates that row, and the abandoned-follow-up sweep's prefilter still
 * relies on its currentStep/lastMessageAt.
 */
export async function upsertActiveCart(
  userId: string,
  businessId: string,
  platform: string,
  threadId: string,
  senderId: string | undefined,
  items: ActiveCartItem[],
): Promise<void> {
  const channel = CHANNEL_FROM_PLATFORM[platform] ?? platform;
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  await db
    .insert(cart)
    .values({ userId, customerId: null, channel, threadId, items, subtotal, status: "active" })
    .onConflictDoUpdate({
      target: [cart.userId, cart.threadId],
      set: {
        items,
        subtotal,
        status: "active",
        lastActivityAt: new Date(),
        // Re-arm the follow-up sweep: a customer who was nudged, came back, and got a
        // fresh quote is a new abandonment episode if they go quiet again, and deserves
        // its own follow-up rather than being silently skipped forever because the flag
        // from last time was never cleared.
        reminderSentAt: null,
      },
    });

  const [existing] = await db
    .select({ id: agentSession.id, state: agentSession.state })
    .from(agentSession)
    .where(and(eq(agentSession.businessId, businessId), eq(agentSession.threadId, threadId)));

  if (existing) {
    await db
      .update(agentSession)
      .set({
        state: { ...existing.state, currentStep: "cart_active" },
        lastMessageAt: new Date(),
        senderId: senderId ?? undefined,
        followUpSentAt: null,
      })
      .where(eq(agentSession.id, existing.id));
    return;
  }

  await db.insert(agentSession).values({
    userId,
    businessId,
    channel,
    threadId,
    senderId,
    state: { currentStep: "cart_active" },
  });
}

// Log an AI-generated reply so future turns in this thread have it as history.
export async function logOutboundMessage(params: {
  userId: string;
  businessId: string;
  threadId: string;
  platform: string;
  platformAccountId: string;
  recipientId?: string;
  messageId?: string;
  text: string;
}): Promise<void> {
  const { userId, businessId, threadId, platform, platformAccountId, recipientId, messageId, text } = params;

  await db.insert(metaWebhookEvent).values({
    dedupeKey: `outbound:aireply:${platform}:${threadId}:${Date.now()}:${crypto.randomUUID()}`,
    platform,
    object: "page",
    eventType: "outbound",
    userId,
    businessId,
    platformAccountId,
    threadId,
    sourceId: messageId ?? null,
    rawPayload: {
      direction: "outbound",
      threadKey: threadId,
      recipientId: recipientId ?? null,
      text,
    },
    status: "sent",
    sentBy: "ai",
  });
}

// Export a convenience map of functions
export const aiHelpers = {
  getTopSellingProducts,
  getProductById,
  listActiveProducts,
  searchProductsByKeyword,
  getProductVariants,
  checkProductStock,
  createCustomerAndOrder,
  getOrdersForThread,
  getPendingReviewOrder,
  submitReview,
  confirmCodForThread,
  getCustomerPurchaseHistory,
  getCustomerByPhone,
  getBusinessProfile,
  getOfferByCode,
  getComboOffersForProduct,
  getFAQMatches,
  getLowStockProducts,
  getProductsByTag,
  getConversationHistory,
  logOutboundMessage,
  quoteOrder,
  upsertActiveCart,
  getShippingCost,
  getConversationHandlingMode,
  escalateToHuman,
  logComplaint,
  routeBulkInquiry,
  getConversationSummary,
  generateAndSaveConversationSummary,
  getCustomerForThread,
  createNotification,
  getActiveCampaigns,
  hasPriorPurchases,
};
