import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray } from "@acme/db";
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
import { protectedProcedure } from "../trpc";

const CustomerInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  district: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

const OrderItemInput = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().min(1).default(1),
  unitPrice: z.number().min(0).optional(),
});

const CreateOrderInput = z.object({
  customerId: z.string().optional(),
  customer: CustomerInput.optional(),
  items: z.array(OrderItemInput).min(1),
  shippingDistrict: z.string().optional(),
  shippingAddress: z.string().optional(),
  couponCode: z.string().optional(),
  channel: z.string().default("web"),
  threadId: z.string().optional(),
  notes: z.string().optional(),
});

const getCustomerForUser = async (ctx: any, userId: string, customerData: z.infer<typeof CustomerInput>) => {
  const customerInput = {
    name: customerData.name,
    phone: customerData.phone ?? null,
    email: customerData.email ?? null,
    address: customerData.address ?? null,
    district: customerData.district ?? null,
    country: customerData.country ?? null,
    notes: customerData.notes ?? null,
  };

  if (customerData.id) {
    const [updated] = await ctx.db
      .update(customer)
      .set(customerInput)
      .where(and(eq(customer.id, customerData.id), eq(customer.userId, userId)))
      .returning();

    if (updated) {
      return updated;
    }
  }

  const existingByEmail = customerData.email
    ? await ctx.db.query.customer.findFirst({
        where: and(eq(customer.userId, userId), eq(customer.email, customerData.email)),
      })
    : null;

  if (existingByEmail) {
    const [updated] = await ctx.db
      .update(customer)
      .set(customerInput)
      .where(eq(customer.id, existingByEmail.id))
      .returning();
    return updated;
  }

  const existingByPhone = customerData.phone
    ? await ctx.db.query.customer.findFirst({
        where: and(eq(customer.userId, userId), eq(customer.phone, customerData.phone)),
      })
    : null;

  if (existingByPhone) {
    const [updated] = await ctx.db
      .update(customer)
      .set(customerInput)
      .where(eq(customer.id, existingByPhone.id))
      .returning();
    return updated;
  }

  const [inserted] = await ctx.db
    .insert(customer)
    .values({ userId, ...customerInput })
    .returning();

  return inserted;
};

const computeShippingCost = async (ctx: any, userId: string, shippingDistrict?: string) => {
  if (shippingDistrict) {
    const shipping = await ctx.db.query.shippingRate.findFirst({
      where: and(
        eq(shippingRate.userId, userId),
        eq(shippingRate.district, shippingDistrict),
        eq(shippingRate.active, true),
      ),
    });

    if (shipping) {
      return shipping.cost;
    }
  }

  const profile = await ctx.db.query.businessProfile.findFirst({
    where: eq(businessProfile.userId, userId),
  });

  return profile?.defaultShippingCost ?? 0;
};

const calculateDiscount = (coupon: any, subtotal: number) => {
  if (!coupon) {
    return 0;
  }

  if (subtotal < coupon.minSubtotal) {
    return 0;
  }

  if (coupon.type === "fixed") {
    return Math.min(coupon.value, subtotal);
  }

  return Math.floor((subtotal * coupon.value) / 100);
};

const generateOrderNumber = () => `SP-${Date.now()}`;

/** Builds the public checkout link sent to the customer, e.g. https://app.sellpilot.ai/pay/{token} */
function buildPaymentLink() {
  const token = crypto.randomUUID();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return { paymentToken: token, paymentUrl: `${appUrl}/pay/${token}` };
}

export const agentRouter = {
  getBusinessProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.businessProfile.findFirst({
      where: eq(businessProfile.userId, ctx.session.user.id),
    });
  }),

  upsertBusinessProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        logoUrl: z.string().optional(),
        currency: z.string().default("USD"),
        defaultShippingCost: z.number().min(0).default(0),
        supportEmail: z.string().optional(),
        supportPhone: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.businessProfile.findFirst({
        where: eq(businessProfile.userId, ctx.session.user.id),
      });

      if (existing) {
        const [updated] = await ctx.db
          .update(businessProfile)
          .set({ ...input })
          .where(eq(businessProfile.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await ctx.db
        .insert(businessProfile)
        .values({ userId: ctx.session.user.id, ...input })
        .returning();
      return created;
    }),

  listProducts: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const products = await ctx.db.query.product.findMany({
        where: eq(product.userId, ctx.session.user.id),
        orderBy: desc(product.createdAt),
      });

      if (!input.query) {
        return products;
      }

      const lowerQuery = input.query.toLowerCase();
      return products.filter(
        (item) =>
          item.title.toLowerCase().includes(lowerQuery) ||
          String(item.description ?? "").toLowerCase().includes(lowerQuery),
      );
    }),

  getProductById: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      const productRow = await ctx.db.query.product.findFirst({
        where: and(eq(product.id, input.productId), eq(product.userId, ctx.session.user.id)),
      });

      if (!productRow) {
        return null;
      }

      const variants = await ctx.db.query.productVariant.findMany({
        where: eq(productVariant.productId, input.productId),
      });

      return { product: productRow, variants };
    }),

  listOffers: protectedProcedure.query(({ ctx }) => {
    return ctx.db.query.offer.findMany({
      where: and(eq(offer.userId, ctx.session.user.id), eq(offer.active, true)),
      orderBy: desc(offer.createdAt),
    });
  }),

  listShippingRates: protectedProcedure.query(({ ctx }) => {
    return ctx.db.query.shippingRate.findMany({
      where: eq(shippingRate.userId, ctx.session.user.id),
      orderBy: desc(shippingRate.createdAt),
    });
  }),

  listPolicies: protectedProcedure
    .input(z.object({ type: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.policy.findMany({
        where: and(eq(policy.userId, ctx.session.user.id), eq(policy.active, true)),
        orderBy: desc(policy.createdAt),
      });

      if (!input.type) {
        return rows;
      }

      return rows.filter((row) => row.type === input.type);
    }),

  listFaqs: protectedProcedure
    .input(z.object({ tag: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.faq.findMany({
        where: eq(faq.userId, ctx.session.user.id),
        orderBy: desc(faq.createdAt),
      });

      const searchTag = input.tag;
      if (!searchTag) {
        return rows;
      }

      return rows.filter((row) => row.tags.includes(searchTag));
    }),

  createOrUpdateCustomer: protectedProcedure
    .input(CustomerInput)
    .mutation(async ({ ctx, input }) => {
      return getCustomerForUser(ctx, ctx.session.user.id, input);
    }),

  createOrder: protectedProcedure.input(CreateOrderInput).mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      let customerRow = null;
      if (input.customerId) {
        customerRow = await ctx.db.query.customer.findFirst({
          where: and(eq(customer.id, input.customerId), eq(customer.userId, userId)),
        });
      }

      if (!customerRow && input.customer) {
        customerRow = await getCustomerForUser(ctx, userId, input.customer);
      }

      if (!customerRow) {
        throw new Error("Customer information is required to create an order.");
      }

      const variantIds = input.items
        .map((item) => item.variantId)
        .filter(Boolean) as string[];

      const variants = variantIds.length
        ? await ctx.db.query.productVariant.findMany({
            where: inArray(productVariant.id, variantIds),
          })
        : [];

      const productIds = Array.from(new Set(variants.map((variant) => variant.productId)));
      const products = productIds.length
        ? await ctx.db.query.product.findMany({
            where: and(inArray(product.id, productIds), eq(product.userId, userId)),
          })
        : [];

      const validVariantIds = new Set(
        variants
          .filter((variant) => products.some((productRow) => productRow.id === variant.productId))
          .map((variant) => variant.id),
      );

      const items = input.items.map((item) => {
        if (item.variantId && !validVariantIds.has(item.variantId)) {
          throw new Error(`Invalid variantId: ${item.variantId}`);
        }
        const selectedVariant = item.variantId ? variants.find((variant) => variant.id === item.variantId) : undefined;
        const unitPrice = item.unitPrice ?? selectedVariant?.price ?? 0;
        const name = selectedVariant?.title ?? "Product item";
        return {
          productId: item.productId,
          variantId: item.variantId ?? null,
          name,
          variantTitle: selectedVariant?.title ?? null,
          qty: item.quantity,
          unitPrice,
          lineTotal: unitPrice * item.quantity,
          imageUrl: selectedVariant?.imageUrl ?? null,
          sku: selectedVariant?.sku ?? null,
        };
      });

      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const shippingCost = await computeShippingCost(ctx, userId, input.shippingDistrict);

      const coupon = input.couponCode
        ? await ctx.db.query.offer.findFirst({
            where: and(eq(offer.userId, userId), eq(offer.code, input.couponCode), eq(offer.active, true)),
          })
        : null;

      const discountAmount = calculateDiscount(coupon, subtotal);
      const total = Math.max(0, subtotal + shippingCost - discountAmount);
      const { paymentToken, paymentUrl } = buildPaymentLink();

      const [createdOrder] = await ctx.db
        .insert(order)
        .values({
          userId,
          customerId: customerRow.id,
          orderNumber: generateOrderNumber(),
          status: "pending",
          subtotal,
          shippingCost,
          discountAmount,
          total,
          customerName: customerRow.name,
          customerPhone: customerRow.phone,
          customerEmail: customerRow.email,
          shippingAddress: input.shippingAddress ?? customerRow.address ?? "",
          shippingDistrict: input.shippingDistrict ?? customerRow.district ?? null,
          couponCode: input.couponCode ?? null,
          channel: input.channel,
          threadId: input.threadId ?? null,
          notes: input.notes ?? null,
          paymentToken,
          paymentUrl,
        })
        .returning();

      if (!createdOrder) {
        throw new Error("Failed to create order.");
      }

      const orderItemRows = items.map((item) => ({
        orderId: createdOrder.id,
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        variantTitle: item.variantTitle,
        sku: item.sku ?? null,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        imageUrl: item.imageUrl ?? null,
      }));

      await ctx.db.insert(orderItem).values(orderItemRows);
      return createdOrder;
    }),

  listOrders: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const baseFilter = and(eq(order.userId, ctx.session.user.id));
      const rows = await ctx.db.query.order.findMany({
        where: input.status ? and(baseFilter, eq(order.status, input.status)) : baseFilter,
        orderBy: desc(order.createdAt),
      });
      return rows;
    }),

  getOrderById: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      const orderRow = await ctx.db.query.order.findFirst({
        where: and(eq(order.id, input.orderId), eq(order.userId, ctx.session.user.id)),
      });
      if (!orderRow) {
        return null;
      }
      const items = await ctx.db.query.orderItem.findMany({
        where: eq(orderItem.orderId, orderRow.id),
      });
      return { ...orderRow, items };
    }),

  updateOrderStatus: protectedProcedure
    .input(z.object({ orderId: z.string(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(order)
        .set({ status: input.status })
        .where(and(eq(order.id, input.orderId), eq(order.userId, ctx.session.user.id)))
        .returning();
      return updated;
    }),

  getOrCreateAgentSession: protectedProcedure
    .input(z.object({ channel: z.string(), threadId: z.string(), senderId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.agentSession.findFirst({
        where: and(eq(agentSession.userId, ctx.session.user.id), eq(agentSession.threadId, input.threadId)),
      });
      if (existing) {
        return existing;
      }
      const [created] = await ctx.db
        .insert(agentSession)
        .values({
          userId: ctx.session.user.id,
          channel: input.channel,
          threadId: input.threadId,
          senderId: input.senderId ?? null,
          state: {},
          lastMessageAt: new Date(),
        })
        .returning();
      return created;
    }),

  setAgentSessionState: protectedProcedure
    .input(z.object({ id: z.string(), state: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(agentSession)
        .set({ state: input.state, lastMessageAt: new Date() })
        .where(and(eq(agentSession.id, input.id), eq(agentSession.userId, ctx.session.user.id)))
        .returning();
      return updated;
    }),

  clearAgentSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [cleared] = await ctx.db
        .update(agentSession)
        .set({ state: {}, lastMessageAt: new Date() })
        .where(and(eq(agentSession.id, input.id), eq(agentSession.userId, ctx.session.user.id)))
        .returning();
      return cleared;
    }),
} satisfies TRPCRouterRecord;
