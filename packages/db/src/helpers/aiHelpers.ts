import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import {
  businessProfile,
  customer,
  faq,
  offer,
  order,
  orderItem,
  shippingRate,
} from "../agent-schema";
import { db } from "../client";
import { conversationMeta } from "../inbox-schema";
import { metaWebhookEvent } from "../meta-webhook-event-schema";
import { product, productVariant } from "../product-schema";

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

// Price a line item, optionally paired with a second combo product — unit price(s),
// offer/compare-at price, combo discount, shipping, and total. Use this instead of having
// the model do price arithmetic itself.
export async function quoteOrder(params: {
  businessId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  district?: string;
  offerCode?: string;
  /** Second product to price alongside the first, e.g. a combo/bundle suggestion the
   * customer agreed to. If a live combo offer matches this exact pair, its discount is
   * applied instead of offerCode — a combo and a typed coupon never stack. */
  comboProductId?: string;
  comboVariantId?: string;
  comboQuantity?: number;
}) {
  const { businessId, productId, variantId, quantity, district, offerCode, comboProductId, comboVariantId, comboQuantity } = params;

  const empty = {
    productTitle: "",
    variantTitle: null as string | null,
    unitPrice: 0,
    compareAtPrice: null as number | null,
    quantity,
    comboProductTitle: null as string | null,
    comboUnitPrice: null as number | null,
    comboQuantity: null as number | null,
    subtotal: 0,
    discountAmount: 0,
    shippingCost: 0,
    estimatedShippingDays: null as number | null,
    total: 0,
    currency: "USD",
  };

  const main = await resolveProductVariant(businessId, productId, variantId);
  if (main.error) return { ...empty, productTitle: main.product?.title ?? "", error: main.error };
  const { product: p, variant } = main;

  let combo: Awaited<ReturnType<typeof resolveProductVariant>> | null = null;
  if (comboProductId) {
    combo = await resolveProductVariant(businessId, comboProductId, comboVariantId);
    if (combo.error) return { ...empty, productTitle: p.title, error: `Combo product: ${combo.error}` };
  }

  const mainSubtotal = variant.price * quantity;
  const comboQty = comboQuantity ?? 1;
  const comboSubtotal = combo?.variant ? combo.variant.price * comboQty : 0;
  const subtotal = mainSubtotal + comboSubtotal;

  let discountAmount = 0;
  if (combo?.variant) {
    const [comboOffer] = await db.select().from(offer).where(liveComboOfferWhere(businessId, productId, comboProductId!, new Date()));
    discountAmount = calculateDiscount(comboOffer, subtotal);
  } else if (offerCode) {
    const [coupon] = await db.select().from(offer).where(liveOfferWhere(businessId, offerCode, new Date()));
    discountAmount = calculateDiscount(coupon, subtotal);
  }

  const { cost: shippingCost, estimatedDays } = await getShippingCost(businessId, district);
  const total = Math.max(0, subtotal + shippingCost - discountAmount);
  const profile = await getBusinessProfile(businessId);

  return {
    productTitle: p.title,
    variantTitle: variant.title,
    unitPrice: variant.price,
    compareAtPrice: variant.compareAtPrice ?? null,
    quantity,
    comboProductTitle: combo?.product?.title ?? null,
    comboUnitPrice: combo?.variant?.price ?? null,
    comboQuantity: combo?.variant ? comboQty : null,
    subtotal,
    discountAmount,
    shippingCost,
    estimatedShippingDays: estimatedDays,
    total,
    currency: profile?.currency ?? "USD",
  };
}

// Create a customer + order, optionally with a second combo product as a paired line item.
export async function createCustomerAndOrder(params: {
  userId: string;
  businessId: string;
  threadId: string;
  channel: string;
  productId: string;
  variantId?: string;
  quantity: number;
  customerName: string;
  phone: string;
  address: string;
  district?: string;
  offerCode?: string;
  /** Second product the customer agreed to add — e.g. accepting a combo suggestion. If a
   * live combo offer matches this exact pair, its discount applies instead of offerCode. */
  comboProductId?: string;
  comboVariantId?: string;
  comboQuantity?: number;
}) {
  const {
    userId,
    businessId,
    threadId,
    channel,
    productId,
    variantId,
    quantity,
    customerName,
    phone,
    address,
    district,
    offerCode,
    comboProductId,
    comboVariantId,
    comboQuantity,
  } = params;

  const main = await resolveProductVariant(businessId, productId, variantId);
  if (main.error) return { success: false, error: main.error };
  const { product: p, variant } = main;
  if ((variant.inventoryQuantity ?? 0) < quantity)
    return { success: false, error: "Insufficient stock" };

  let combo: Awaited<ReturnType<typeof resolveProductVariant>> | null = null;
  const comboQty = comboQuantity ?? 1;
  if (comboProductId) {
    combo = await resolveProductVariant(businessId, comboProductId, comboVariantId);
    if (combo.error) return { success: false, error: `Combo product: ${combo.error}` };
    if ((combo.variant.inventoryQuantity ?? 0) < comboQty)
      return { success: false, error: "Insufficient stock for combo product" };
  }

  const cust = await upsertCustomerByPhone(userId, businessId, { name: customerName, phone, address });
  if (!cust) return { success: false, error: "Unable to create customer" };

  const mainSubtotal = variant.price * quantity;
  const comboSubtotal = combo?.variant ? combo.variant.price * comboQty : 0;
  const subtotal = mainSubtotal + comboSubtotal;

  let discountAmount = 0;
  if (combo?.variant) {
    const [comboOffer] = await db.select().from(offer).where(liveComboOfferWhere(businessId, productId, comboProductId!, new Date()));
    discountAmount = calculateDiscount(comboOffer, subtotal);
  } else if (offerCode) {
    const [coupon] = await db.select().from(offer).where(liveOfferWhere(businessId, offerCode, new Date()));
    discountAmount = calculateDiscount(coupon, subtotal);
  }

  const { cost: shippingCost } = await getShippingCost(businessId, district);
  const total = Math.max(0, subtotal + shippingCost - discountAmount);
  const { paymentToken, paymentUrl } = buildPaymentLink();

  const [created] = await db
    .insert(order)
    .values({
      userId,
      businessId,
      customerId: cust.id,
      orderNumber: generateOrderNumber(),
      status: "pending",
      subtotal,
      shippingCost,
      discountAmount,
      total,
      customerName,
      customerPhone: phone,
      shippingAddress: address,
      shippingDistrict: district ?? null,
      couponCode: combo?.variant ? null : (offerCode ?? null),
      channel,
      threadId,
      paymentToken,
      paymentUrl,
    })
    .returning();
  if (!created) return { success: false, error: "Unable to create order" };

  await db.insert(orderItem).values({
    orderId: created.id,
    productId,
    variantId: variant.id,
    name: p.title,
    variantTitle: variant.title,
    qty: quantity,
    unitPrice: variant.price,
    lineTotal: variant.price * quantity,
    imageUrl: variant.imageUrl,
  });

  await db
    .update(productVariant)
    .set({ inventoryQuantity: (variant.inventoryQuantity ?? 0) - quantity })
    .where(eq(productVariant.id, variant.id));

  if (combo?.variant && combo.product) {
    await db.insert(orderItem).values({
      orderId: created.id,
      productId: comboProductId,
      variantId: combo.variant.id,
      name: combo.product.title,
      variantTitle: combo.variant.title,
      qty: comboQty,
      unitPrice: combo.variant.price,
      lineTotal: combo.variant.price * comboQty,
      imageUrl: combo.variant.imageUrl,
    });

    await db
      .update(productVariant)
      .set({ inventoryQuantity: (combo.variant.inventoryQuantity ?? 0) - comboQty })
      .where(eq(productVariant.id, combo.variant.id));
  }

  await linkConversationToCustomer(userId, businessId, threadId, cust.id);

  return {
    success: true,
    orderId: created.id,
    orderNumber: created.orderNumber,
    paymentUrl: created.paymentUrl ?? undefined,
    total: created.total,
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
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ name: i.name, variantTitle: i.variantTitle, qty: i.qty, lineTotal: i.lineTotal })),
  }));
}

// Get customer by phone
export async function getCustomerByPhone(businessId: string, phone: string) {
  const [c] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.businessId, businessId), eq(customer.phone, phone)));
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

// Get low stock products
export async function getLowStockProducts(businessId: string, threshold = 5) {
  const variants = await db.select().from(productVariant);
  const products = await db.select().from(product);
  const prodById = new Map(products.map((p) => [p.id, p]));
  const low = variants
    .filter((v) => (v.inventoryQuantity ?? 0) < threshold)
    .filter((v) => {
      const p = prodById.get(v.productId);
      return !!p && p.businessId === businessId;
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
  limit = 20,
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
  getShippingCost,
  getConversationHandlingMode,
};
