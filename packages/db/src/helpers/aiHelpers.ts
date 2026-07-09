import { and, desc, eq, inArray } from "drizzle-orm";

import {
  businessProfile,
  customer,
  faq,
  offer,
  order,
  orderItem,
} from "../agent-schema";
import { db } from "../client";
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

// Create a simple order (re-usable small helper)
export async function createCustomerAndOrder(
  userId: string,
  productId: string,
  quantity: number,
  customerName: string,
  phone: string,
  address: string,
) {
  // find product and variant
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.userId, userId), eq(product.id, productId)));
  if (!p) return { success: false, error: "Product not found" };
  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, p.id));
  const variant = variants[0];
  if (!variant) return { success: false, error: "No variant" };
  if ((variant.inventoryQuantity ?? 0) < quantity)
    return { success: false, error: "Insufficient stock" };

  const [cust] = await db
    .insert(customer)
    .values({ userId, name: customerName, phone, address })
    .returning();
  if (!cust) return { success: false, error: "Unable to create customer" };

  const [created] = await db
    .insert(order)
    .values({
      userId,
      customerId: cust.id,
      orderNumber: `SP-${Date.now()}`,
      status: "pending",
      subtotal: variant.price * quantity,
      shippingCost: 0,
      discountAmount: 0,
      total: variant.price * quantity,
      customerName,
      customerPhone: phone,
      shippingAddress: address,
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
    .where(eq(productVariant.id, variant.id))
    .returning();

  return { success: true, orderId: created.id };
}

// Get recent orders for user
export async function getRecentOrders(userId: string, limit = 10) {
  return await db
    .select()
    .from(order)
    .where(eq(order.userId, userId))
    .orderBy(desc(order.createdAt))
    .limit(limit);
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

// Export a convenience map of functions
export const aiHelpers = {
  getTopSellingProducts,
  getProductById,
  listActiveProducts,
  searchProductsByKeyword,
  getProductVariants,
  checkProductStock,
  createCustomerAndOrder,
  getRecentOrders,
  getCustomerByPhone,
  getBusinessProfile,
  getOfferByCode,
  getFAQMatches,
  getLowStockProducts,
  getProductsByTag,
};
