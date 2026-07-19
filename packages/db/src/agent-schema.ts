import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  boolean,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { product, productVariant } from "./product-schema";

/**
 * Business profile per user (merchant). Scoped by userId so the AI agent
 * never crosses tenant boundaries when answering questions.
 */
export const businessProfile = pgTable(
  "business_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    logoUrl: text("logo_url"),
    currency: text("currency").default("USD").notNull(),
    defaultShippingCost: integer("default_shipping_cost").default(0).notNull(),
    supportEmail: text("support_email"),
    supportPhone: text("support_phone"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("business_profile_user_unique").on(table.userId)],
);

/**
 * Discount / promotional offers. Scoped by userId.
 */
export const offer = pgTable(
  "offer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    code: text("code"),
    description: text("description"),
    /** Discount type: "percentage" | "fixed" */
    type: text("type").default("percentage").notNull(),
    /** For percentage: 10 = 10%. For fixed: amount in minor units (cents). */
    value: integer("value").notNull(),
    minSubtotal: integer("min_subtotal").default(0).notNull(),
    startDate: timestamp("start_date").defaultNow().notNull(),
    endDate: timestamp("end_date"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("offer_user_id_idx").on(table.userId)],
);

/**
 * Customers (shoppers) per merchant. Scoped by userId.
 * Lookup by phone/email — created lazily by the AI agent when placing an order.
 */
export const customer = pgTable(
  "customer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    district: text("district"),
    country: text("country"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("customer_user_id_idx").on(table.userId),
    unique("customer_user_phone_unique").on(table.userId, table.phone),
    unique("customer_user_email_unique").on(table.userId, table.email),
  ],
);

/**
 * Orders. Scoped by userId. status lifecycle:
 * pending -> confirmed -> paid -> shipped -> delivered -> cancelled | returned
 */
export const order = pgTable(
  "order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),
    /** Human-readable order number, e.g. #10051 */
    orderNumber: text("order_number").notNull(),
    status: text("status").default("pending").notNull(),
    /** Subtotal in minor units */
    subtotal: integer("subtotal").default(0).notNull(),
    shippingCost: integer("shipping_cost").default(0).notNull(),
    discountAmount: integer("discount_amount").default(0).notNull(),
    total: integer("total").default(0).notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    shippingAddress: text("shipping_address"),
    shippingDistrict: text("shipping_district"),
    /** Applied offer code, if any */
    couponCode: text("coupon_code"),
    /** Free-form channel context: messenger, instagram, whatsapp, web */
    channel: text("channel"),
    /** External thread id (Meta thread key) for syncing back to the channel */
    threadId: text("thread_id"),
    notes: text("notes"),
    /** Opaque token used in the public checkout link (/pay/[token]) — not the row id, to avoid enumeration */
    paymentToken: text("payment_token"),
    /** Full checkout URL sent to the customer, e.g. https://app.sellpilot.ai/pay/{paymentToken} */
    paymentUrl: text("payment_url"),
    /** "bkash" | "nagad" | "card" | "cod" | "sslcommerz" */
    paymentMethod: text("payment_method"),
    /** Customer-submitted screenshot for manual bKash/Nagad confirmation via chat */
    paymentScreenshotUrl: text("payment_screenshot_url"),
    paymentConfirmedAt: timestamp("payment_confirmed_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("order_user_id_idx").on(table.userId),
    index("order_customer_id_idx").on(table.customerId),
    index("order_thread_id_idx").on(table.threadId),
    unique("order_user_order_number_unique").on(table.userId, table.orderNumber),
    unique("order_payment_token_unique").on(table.paymentToken),
  ],
);

/**
 * Order line items. Each references a product variant at the time of purchase.
 */
export const orderItem = pgTable(
  "order_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, {
      onDelete: "set null",
    }),
    variantId: text("variant_id").references(() => productVariant.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    variantTitle: text("variant_title"),
    sku: text("sku"),
    qty: integer("qty").notNull().default(1),
    /** Unit price in minor units at time of purchase */
    unitPrice: integer("unit_price").notNull(),
    /** Line total = qty * unitPrice */
    lineTotal: integer("line_total").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_item_order_id_idx").on(table.orderId),
    index("order_item_variant_id_idx").on(table.variantId),
  ],
);

/**
 * Live/abandoned carts, one row per in-progress conversation cart. Distinct from
 * agentSession.state.cart (the LLM's working memory) — this is the queryable,
 * relational record used to detect abandonment and drive recovery follow-ups.
 * status lifecycle: active -> abandoned -> recovered | converted
 */
export const cart = pgTable(
  "cart",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    threadId: text("thread_id").notNull(),
    items: jsonb("items")
      .$type<{ productId: string; variantId?: string; name: string; variantTitle?: string; qty: number; unitPrice: number; imageUrl?: string }[]>()
      .default([])
      .notNull(),
    subtotal: integer("subtotal").default(0).notNull(),
    status: text("status").default("active").notNull(),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
    reminderSentAt: timestamp("reminder_sent_at"),
    convertedOrderId: text("converted_order_id").references(() => order.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("cart_user_id_idx").on(table.userId),
    index("cart_status_idx").on(table.status),
    unique("cart_user_thread_unique").on(table.userId, table.threadId),
  ],
);

/**
 * Post-delivery reviews, requested by the AI agent and (optionally) collected via chat.
 */
export const review = pgTable(
  "review",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),
    productId: text("product_id").references(() => product.id, {
      onDelete: "set null",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("review_user_id_idx").on(table.userId),
    index("review_order_id_idx").on(table.orderId),
    index("review_product_id_idx").on(table.productId),
  ],
);

/**
 * In-app notifications for the merchant (dashboard bell icon).
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** e.g. "order_placed", "low_stock", "review_received", "cart_abandoned" */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** In-app path to navigate to on click, e.g. /dashboard/orders */
    link: text("link"),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_user_id_idx").on(table.userId),
    index("notification_read_idx").on(table.read),
  ],
);

/**
 * SellPilot's own SaaS subscription for this merchant (billing SellPilot, not the
 * merchant's own store). Provider-agnostic until a payment gateway is wired up for it.
 */
export const subscription = pgTable(
  "subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "starter" | "pro" | "enterprise" */
    plan: text("plan").notNull(),
    /** "trialing" | "active" | "past_due" | "cancelled" */
    status: text("status").default("trialing").notNull(),
    /** Payment provider once wired up, e.g. "sslcommerz" */
    provider: text("provider"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: timestamp("current_period_start").defaultNow().notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_user_id_idx").on(table.userId),
    index("subscription_status_idx").on(table.status),
  ],
);

/**
 * FAQ knowledge base. Scoped by userId.
 */
export const faq = pgTable(
  "faq",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("faq_user_id_idx").on(table.userId)],
);

/**
 * Store policies (shipping, return, warranty, privacy...). Scoped by userId.
 * type values: "shipping" | "return" | "warranty" | "privacy" | "terms"
 */
export const policy = pgTable(
  "policy",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("policy_user_id_idx").on(table.userId),
    unique("policy_user_type_unique").on(table.userId, table.type),
  ],
);

/**
 * Shipping rates per district. Scoped by userId.
 * Used by the AI agent's calculateShipping tool.
 */
export const shippingRate = pgTable(
  "shipping_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    district: text("district").notNull(),
    /** Cost in minor units */
    cost: integer("cost").notNull().default(0),
    /** Estimated delivery days */
    estimatedDays: integer("estimated_days"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("shipping_rate_user_id_idx").on(table.userId),
    unique("shipping_rate_user_district_unique").on(
      table.userId,
      table.district,
    ),
  ],
);

/**
 * Structured agent memory layer — one row per conversation thread.
 * The AI agent reads this on each turn and updates it after every tool call,
 * so the LLM gets a reliable cart/customer/step snapshot instead of having
 * to reconstruct state from chat history.
 */
export const agentSession = pgTable(
  "agent_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Channel: "messenger" | "instagram" | "whatsapp" | "web" */
    channel: text("channel").notNull(),
    /** Meta thread key or web session id */
    threadId: text("thread_id").notNull(),
    /** Customer identifier (PSID, IG id, WA phone, etc.) */
    senderId: text("sender_id"),
    state: jsonb("state")
      .$type<AgentSessionState>()
      .default({})
      .notNull(),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("agent_session_user_id_idx").on(table.userId),
    unique("agent_session_thread_unique").on(table.userId, table.threadId),
  ],
);

export interface AgentSessionState {
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    district?: string;
    customerId?: string;
  };
  cart?: Array<{
    productId: string;
    variantId: string;
    name: string;
    variantTitle?: string;
    quantity: number;
    unitPrice: number;
    imageUrl?: string;
  }>;
  shippingAddress?: string;
  shippingDistrict?: string;
  shippingCost?: number;
  discount?: { code: string; amount: number };
  currentStep?:
    | "browsing"
    | "product_selected"
    | "cart_active"
    | "collecting_customer"
    | "awaiting_confirmation"
    | "order_placed"
    | "support";
  pendingOrderId?: string;
  notes?: string;
}

export const customRole = pgTable(
  "custom_role",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    description: text("description"),
    permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("custom_role_user_id_idx").on(table.userId),
    unique("custom_role_user_key_unique").on(table.userId, table.key),
  ],
);

// Relations ------------------------------------------------------------------

export const businessProfileRelations = relations(
  businessProfile,
  ({ one }) => ({
    user: one(user, {
      fields: [businessProfile.userId],
      references: [user.id],
    }),
  }),
);

export const offerRelations = relations(offer, ({ one }) => ({
  user: one(user, { fields: [offer.userId], references: [user.id] }),
}));

export const customerRelations = relations(customer, ({ one, many }) => ({
  user: one(user, { fields: [customer.userId], references: [user.id] }),
  orders: many(order),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  customer: one(customer, {
    fields: [order.customerId],
    references: [customer.id],
  }),
  items: many(orderItem),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  product: one(product, {
    fields: [orderItem.productId],
    references: [product.id],
  }),
  variant: one(productVariant, {
    fields: [orderItem.variantId],
    references: [productVariant.id],
  }),
}));

export const faqRelations = relations(faq, ({ one }) => ({
  user: one(user, { fields: [faq.userId], references: [user.id] }),
}));

export const policyRelations = relations(policy, ({ one }) => ({
  user: one(user, { fields: [policy.userId], references: [user.id] }),
}));

export const shippingRateRelations = relations(shippingRate, ({ one }) => ({
  user: one(user, { fields: [shippingRate.userId], references: [user.id] }),
}));

export const agentSessionRelations = relations(agentSession, ({ one }) => ({
  user: one(user, { fields: [agentSession.userId], references: [user.id] }),
}));

export const cartRelations = relations(cart, ({ one }) => ({
  user: one(user, { fields: [cart.userId], references: [user.id] }),
  customer: one(customer, { fields: [cart.customerId], references: [customer.id] }),
  convertedOrder: one(order, { fields: [cart.convertedOrderId], references: [order.id] }),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  user: one(user, { fields: [review.userId], references: [user.id] }),
  order: one(order, { fields: [review.orderId], references: [order.id] }),
  customer: one(customer, { fields: [review.customerId], references: [customer.id] }),
  product: one(product, { fields: [review.productId], references: [product.id] }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, { fields: [subscription.userId], references: [user.id] }),
}));

export const customRoleRelations = relations(customRole, ({ one }) => ({
  user: one(user, { fields: [customRole.userId], references: [user.id] }),
}));
