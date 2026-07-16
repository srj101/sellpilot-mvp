import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { and, desc, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import {
  agentSession,
  businessProfile,
  customer,
  faq,
  offer,
  order,
  orderItem,
  policy,
  product,
  productVariant,
  shippingRate,
} from "@acme/db/schema";

import { auth } from "~/auth/server";
import { env } from "~/env";
import { searchProductsByImage } from "@acme/api/chromadb";

const calculateCouponDiscount = (couponRow: any, subtotal: number) => {
  if (!couponRow) {
    return 0;
  }

  if (couponRow.type === "fixed") {
    return Math.min(couponRow.value, subtotal);
  }

  return Math.floor((subtotal * couponRow.value) / 100);
};

const buildOrderItems = (items: any[], variants: any[]) => {
  return items.map((item) => {
    const variant = item.variantId
      ? variants.find((variantRow) => variantRow.id === item.variantId)
      : undefined;

    const unitPrice =
      typeof item.unitPrice === "number"
        ? item.unitPrice
        : (variant?.price ?? 0);

    return {
      productId: item.productId,
      variantId: item.variantId ?? null,
      name: variant?.title ?? "Item",
      variantTitle: variant?.title ?? null,
      qty: item.quantity ?? 1,
      unitPrice,
      lineTotal: unitPrice * (item.quantity ?? 1),
      imageUrl: variant?.imageUrl ?? null,
    };
  });
};

const findOrCreateCustomer = async (userId: string, payload: any) => {
  let customerRow = null;
  if (payload.customerId) {
    const [foundCustomer] = await db
      .select()
      .from(customer)
      .where(
        and(eq(customer.id, payload.customerId), eq(customer.userId, userId)),
      );
    customerRow = foundCustomer ?? null;
  }

  if (!customerRow) {
    const existingEmail = payload.customer?.email
      ? await db
          .select()
          .from(customer)
          .where(
            and(
              eq(customer.userId, userId),
              eq(customer.email, payload.customer.email),
            ),
          )
          .then((rows) => rows[0] ?? null)
      : null;
    const existingPhone = payload.customer?.phone
      ? await db
          .select()
          .from(customer)
          .where(
            and(
              eq(customer.userId, userId),
              eq(customer.phone, payload.customer.phone),
            ),
          )
          .then((rows) => rows[0] ?? null)
      : null;

    customerRow = existingEmail ?? existingPhone ?? null;
  }

  if (customerRow) {
    const [updated] = await db
      .update(customer)
      .set({
        name: payload.customer.name,
        phone: payload.customer.phone ?? null,
        email: payload.customer.email ?? null,
        address: payload.customer.address ?? null,
        district: payload.customer.district ?? null,
        notes: payload.customer.notes ?? null,
      })
      .where(eq(customer.id, customerRow.id))
      .returning();

    return updated ?? customerRow;
  }

  const [inserted] = await db
    .insert(customer)
    .values({
      userId,
      name: payload.customer.name,
      phone: payload.customer.phone ?? null,
      email: payload.customer.email ?? null,
      address: payload.customer.address ?? null,
      district: payload.customer.district ?? null,
      notes: payload.customer.notes ?? null,
    })
    .returning();

  return inserted;
};

const toolHandlers: Record<
  string,
  (userId: string, payload: any) => Promise<unknown>
> = {
  async listProducts(userId, payload) {
    const products = await db.query.product.findMany({
      where: eq(product.userId, userId),
      orderBy: desc(product.createdAt),
    });
    if (!payload?.query) {
      return products;
    }
    const query = String(payload.query).toLowerCase();
    return products.filter((item) => {
      const description =
        typeof item.description === "string" ? item.description : "";
      return (
        item.title.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query)
      );
    });
  },

  async getProduct(userId, payload) {
    if (!payload?.productId) {
      throw new Error("productId is required");
    }
    const productRow = await db.query.product.findFirst({
      where: and(eq(product.id, payload.productId), eq(product.userId, userId)),
    });
    if (!productRow) {
      return null;
    }
    const variants = await db.query.productVariant.findMany({
      where: eq(productVariant.productId, payload.productId),
    });
    return { product: productRow, variants };
  },

  async listOffers(userId) {
    return db.query.offer.findMany({
      where: and(eq(offer.userId, userId), eq(offer.active, true)),
      orderBy: desc(offer.createdAt),
    });
  },

  async listFaqs(userId, payload) {
    const faqs = await db.query.faq.findMany({
      where: eq(faq.userId, userId),
      orderBy: desc(faq.createdAt),
    });
    if (!payload?.tag) {
      return faqs;
    }
    return faqs.filter((row) => row.tags.includes(String(payload.tag)));
  },

  async listPolicies(userId, payload) {
    const policies = await db.query.policy.findMany({
      where: eq(policy.userId, userId),
      orderBy: desc(policy.createdAt),
    });
    if (!payload?.type) {
      return policies;
    }
    return policies.filter((row) => row.type === payload.type);
  },

  async getShippingRates(userId) {
    return db.query.shippingRate.findMany({
      where: eq(shippingRate.userId, userId),
      orderBy: desc(shippingRate.createdAt),
    });
  },

  async getAgentSession(userId, payload) {
    if (!payload?.threadId || !payload?.channel) {
      throw new Error("threadId and channel are required");
    }
    const existing = await db.query.agentSession.findFirst({
      where: and(
        eq(agentSession.userId, userId),
        eq(agentSession.threadId, payload.threadId),
      ),
    });
    if (existing) {
      return existing;
    }
    const [created] = await db
      .insert(agentSession)
      .values({
        userId,
        channel: payload.channel,
        threadId: payload.threadId,
        senderId: payload.senderId ?? null,
        state: {},
        lastMessageAt: new Date(),
      })
      .returning();
    return created;
  },

  async updateAgentSessionState(userId, payload) {
    if (!payload?.id || payload.state === undefined) {
      throw new Error("id and state are required");
    }
    const [updated] = await db
      .update(agentSession)
      .set({ state: payload.state, lastMessageAt: new Date() })
      .where(
        and(eq(agentSession.id, payload.id), eq(agentSession.userId, userId)),
      )
      .returning();
    return updated;
  },

  async createOrder(userId, payload) {
    const customerPayload = payload.customer;
    if (!customerPayload?.name) {
      throw new Error("Customer name is required");
    }

    // find or create customer using helper
    const customerRow = await findOrCreateCustomer(userId, {
      customerId: payload.customerId,
      customer: customerPayload,
    });

    if (!customerRow) {
      throw new Error("Customer information is required to create an order.");
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      throw new Error("Order items are required");
    }

    const variantIds = items.map((item: any) => item.variantId).filter(Boolean);
    const variants = variantIds.length
      ? await db.query.productVariant.findMany({
          where: inArray(productVariant.id, variantIds),
        })
      : [];

    const orderItems = buildOrderItems(items, variants);

    const subtotal = orderItems.reduce(
      (sum: number, item: any) => sum + item.lineTotal,
      0,
    );

    // compute totals (shipping, discount, total)
    const computeTotals = async () => {
      const shippingRateRow = payload.shippingDistrict
        ? await db.query.shippingRate.findFirst({
            where: and(
              eq(shippingRate.userId, userId),
              eq(shippingRate.district, payload.shippingDistrict),
              eq(shippingRate.active, true),
            ),
          })
        : null;

      const profile = await db.query.businessProfile.findFirst({
        where: eq(businessProfile.userId, userId),
      });

      const shippingCost =
        shippingRateRow?.cost ?? profile?.defaultShippingCost ?? 0;
      const couponRow = payload.couponCode
        ? await db.query.offer.findFirst({
            where: and(
              eq(offer.userId, userId),
              eq(offer.code, payload.couponCode),
              eq(offer.active, true),
            ),
          })
        : null;
      const discountAmount = calculateCouponDiscount(couponRow, subtotal);
      const total = Math.max(0, subtotal + shippingCost - discountAmount);

      return {
        shippingRateRow,
        profile,
        shippingCost,
        couponRow,
        discountAmount,
        total,
      };
    };

    const totals = await computeTotals();

    const persistOrder = async () => {
      const [createdOrder] = await db
        .insert(order)
        .values({
          userId,
          customerId: customerRow.id,
          orderNumber: `SP-${Date.now()}`,
          status: "pending",
          subtotal,
          shippingCost: totals.shippingCost,
          discountAmount: totals.discountAmount,
          total: totals.total,
          customerName: customerRow.name,
          customerPhone: customerRow.phone ?? null,
          customerEmail: customerRow.email ?? null,
          shippingAddress:
            payload.shippingAddress ?? customerRow.address ?? null,
          shippingDistrict:
            payload.shippingDistrict ?? customerRow.district ?? null,
          couponCode: payload.couponCode ?? null,
          channel: payload.channel ?? "web",
          threadId: payload.threadId ?? null,
          notes: payload.notes ?? null,
        })
        .returning();

      if (!createdOrder) {
        throw new Error("Failed to create order.");
      }

      await db.insert(orderItem).values(
        orderItems.map((item: any) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          variantTitle: item.variantTitle,
          sku: null,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          imageUrl: item.imageUrl,
        })),
      );

      return createdOrder;
    };

    return await persistOrder();
  },

  async imageSearch(userId, payload) {
    if (!payload?.imageUrl) {
      throw new Error("imageUrl is required");
    }
    const matches = await searchProductsByImage({
      userId,
      imageUrl: payload.imageUrl,
      limit: 5,
    });
    const productIds = Array.from(
      new Set(matches.map((match) => match.productId)),
    );
    const products = productIds.length
      ? await db
          .select()
          .from(product)
          .where(
            and(eq(product.userId, userId), inArray(product.id, productIds)),
          )
      : [];

    return matches.map((match) => ({
      ...match,
      product: products.find((prod) => prod.id === match.productId) ?? null,
    }));
  },
};

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.tool) {
    const handler = toolHandlers[body.tool];
    if (!handler) {
      return NextResponse.json(
        { error: `Unknown tool: ${body.tool}` },
        { status: 400 },
      );
    }
    try {
      const result = await handler(session.user.id, body.params ?? {});
      return NextResponse.json({ tool: body.tool, result });
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Tool execution failed.",
        },
        { status: 500 },
      );
    }
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json(
      { error: "prompt is required when not invoking a tool." },
      { status: 400 },
    );
  }

  if (!env.AGENT_SERVICE_URL) {
    return NextResponse.json(
      { error: "AGENT_SERVICE_URL is not configured." },
      { status: 500 },
    );
  }

  const upstreamResponse = await fetch(env.AGENT_SERVICE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.CLOUDFLARE_API_TOKEN
        ? { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      model: env.CLOUDFLARE_AGENT_MODEL,
      prompt: body.prompt,
      userId: session.user.id,
      channel: body.channel ?? "web",
      threadId: body.threadId,
      data: body.data ?? {},
    }),
  });

  const data = await upstreamResponse.json().catch(() => null);
  return NextResponse.json(data, { status: upstreamResponse.status });
}
