import { and, desc, eq, inArray } from "drizzle-orm";

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
import { metaWebhookEvent } from "../meta-webhook-event-schema";
import { product, productVariant } from "../product-schema";

// Helper: get top selling products by quantity (limit)
export async function getTopSellingProducts(userId: string, limit = 5) {
  // Get orders for user
  const orderRows = await db
    .select()
    .from(order)
    .where(eq(order.userId, userId));
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
export async function getProductById(userId: string, id: string) {
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.id, id)));
  if (!p) return null;
  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, p.id));
  return { product: p, variants };
}

// List active products
export async function listActiveProducts(userId: string, limit = 20) {
  return await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.status, "active")))
    .limit(limit);
}

// Search products by keyword (simple)
export async function searchProductsByKeyword(
  userId: string,
  keyword: string,
  limit = 10,
) {
  const rows = await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.status, "active")));
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

// Shipping cost for a district, falling back to the business's default shipping cost.
export async function getShippingCost(userId: string, district?: string) {
  if (district) {
    const [rate] = await db
      .select()
      .from(shippingRate)
      .where(
        and(
          eq(shippingRate.userId, userId),
          eq(shippingRate.district, district),
          eq(shippingRate.active, true),
        ),
      );
    if (rate) return { cost: rate.cost, estimatedDays: rate.estimatedDays };
  }
  const profile = await getBusinessProfile(userId);
  return { cost: profile?.defaultShippingCost ?? 0, estimatedDays: null as number | null };
}

// Find or update a customer by phone instead of blindly inserting — repeat customers
// would otherwise crash on the (userId, phone) unique constraint.
async function upsertCustomerByPhone(
  userId: string,
  data: { name: string; phone: string; address: string },
) {
  const [existing] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.userId, userId), eq(customer.phone, data.phone)));

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
    .values({ userId, name: data.name, phone: data.phone, address: data.address })
    .returning();
  return inserted;
}

// Price a single line item: unit price, offer/compare-at price, shipping, and total.
// Use this instead of having the model do price arithmetic itself.
export async function quoteOrder(params: {
  userId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  district?: string;
  offerCode?: string;
}) {
  const { userId, productId, variantId, quantity, district, offerCode } = params;

  const empty = {
    productTitle: "",
    variantTitle: null as string | null,
    unitPrice: 0,
    compareAtPrice: null as number | null,
    quantity,
    subtotal: 0,
    discountAmount: 0,
    shippingCost: 0,
    estimatedShippingDays: null as number | null,
    total: 0,
    currency: "USD",
  };

  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.id, productId)));
  if (!p) return { ...empty, error: "Product not found" };

  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, p.id));
  const variant = variantId ? variants.find((v) => v.id === variantId) : variants[0];
  if (!variant) return { ...empty, productTitle: p.title, error: "Variant not found" };

  const subtotal = variant.price * quantity;

  const [coupon] = offerCode
    ? await db
        .select()
        .from(offer)
        .where(and(eq(offer.userId, userId), eq(offer.code, offerCode), eq(offer.active, true)))
    : [undefined];
  const discountAmount = calculateDiscount(coupon, subtotal);

  const { cost: shippingCost, estimatedDays } = await getShippingCost(userId, district);
  const total = Math.max(0, subtotal + shippingCost - discountAmount);
  const profile = await getBusinessProfile(userId);

  return {
    productTitle: p.title,
    variantTitle: variant.title,
    unitPrice: variant.price,
    compareAtPrice: variant.compareAtPrice ?? null,
    quantity,
    subtotal,
    discountAmount,
    shippingCost,
    estimatedShippingDays: estimatedDays,
    total,
    currency: profile?.currency ?? "USD",
  };
}

// Create a customer + order for a single product/variant line item.
export async function createCustomerAndOrder(params: {
  userId: string;
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
}) {
  const { userId, threadId, channel, productId, variantId, quantity, customerName, phone, address, district, offerCode } = params;

  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.id, productId)));
  if (!p) return { success: false, error: "Product not found" };

  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, p.id));
  const variant = variantId ? variants.find((v) => v.id === variantId) : variants[0];
  if (!variant) return { success: false, error: "No variant" };
  if ((variant.inventoryQuantity ?? 0) < quantity)
    return { success: false, error: "Insufficient stock" };

  const cust = await upsertCustomerByPhone(userId, { name: customerName, phone, address });
  if (!cust) return { success: false, error: "Unable to create customer" };

  const subtotal = variant.price * quantity;
  const [coupon] = offerCode
    ? await db
        .select()
        .from(offer)
        .where(and(eq(offer.userId, userId), eq(offer.code, offerCode), eq(offer.active, true)))
    : [undefined];
  const discountAmount = calculateDiscount(coupon, subtotal);
  const { cost: shippingCost } = await getShippingCost(userId, district);
  const total = Math.max(0, subtotal + shippingCost - discountAmount);
  const { paymentToken, paymentUrl } = buildPaymentLink();

  const [created] = await db
    .insert(order)
    .values({
      userId,
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
      couponCode: offerCode ?? null,
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

  return {
    success: true,
    orderId: created.id,
    orderNumber: created.orderNumber,
    paymentUrl: created.paymentUrl ?? undefined,
    total: created.total,
  };
}

// Orders tied to the current conversation thread only — never other customers' orders.
export async function getOrdersForThread(userId: string, threadId: string) {
  const rows = await db
    .select()
    .from(order)
    .where(and(eq(order.userId, userId), eq(order.threadId, threadId)))
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
export async function getCustomerByPhone(userId: string, phone: string) {
  const [c] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.userId, userId), eq(customer.phone, phone)));
  return c ?? null;
}

// Get business profile
export async function getBusinessProfile(userId: string) {
  const [b] = await db
    .select()
    .from(businessProfile)
    .where(eq(businessProfile.userId, userId));
  return b ?? null;
}

// Get offer by code
export async function getOfferByCode(userId: string, code: string) {
  const [o] = await db
    .select()
    .from(offer)
    .where(and(eq(offer.userId, userId), eq(offer.code, code)));
  return o ?? null;
}

// Get FAQ by query (simple)
export async function getFAQMatches(userId: string, query: string, limit = 5) {
  const rows = await db.select().from(faq).where(eq(faq.userId, userId));
  const q = query.trim().toLowerCase();
  const matches = rows.filter(
    (r) =>
      (r.question ?? "").toLowerCase().includes(q) ||
      (r.answer ?? "").toLowerCase().includes(q),
  );
  return matches.slice(0, limit);
}

// Get low stock products
export async function getLowStockProducts(userId: string, threshold = 5) {
  const variants = await db.select().from(productVariant);
  const products = await db.select().from(product);
  const prodById = new Map(products.map((p) => [p.id, p]));
  const low = variants
    .filter((v) => (v.inventoryQuantity ?? 0) < threshold)
    .filter((v) => {
      const p = prodById.get(v.productId);
      return !!p && p.userId === userId;
    });
  return low.slice(0, 100);
}

// Get products by category/tag (assumes product.metadata or tags)
export async function getProductsByTag(
  userId: string,
  tag: string,
  limit = 10,
) {
  const rows = await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.status, "active")));
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
  userId: string,
  threadId: string,
  limit = 20,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select()
    .from(metaWebhookEvent)
    .where(
      and(
        eq(metaWebhookEvent.userId, userId),
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
  threadId: string;
  platform: string;
  platformAccountId: string;
  messageId?: string;
  text: string;
}): Promise<void> {
  const { userId, threadId, platform, platformAccountId, messageId, text } = params;

  await db.insert(metaWebhookEvent).values({
    dedupeKey: `outbound:aireply:${platform}:${threadId}:${Date.now()}:${crypto.randomUUID()}`,
    platform,
    object: "page",
    eventType: "outbound",
    userId,
    platformAccountId,
    threadId,
    sourceId: messageId ?? null,
    rawPayload: { text },
    status: "sent",
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
  getFAQMatches,
  getLowStockProducts,
  getProductsByTag,
  getConversationHistory,
  logOutboundMessage,
  quoteOrder,
  getShippingCost,
};
