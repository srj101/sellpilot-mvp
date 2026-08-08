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
  bigint,
} from "drizzle-orm/pg-core";

import { business } from "./auth-schema";
import { product, productVariant } from "./product-schema";

/**
 * Business profile — one row per store (unique on businessId), holding the merchant's
 * own settings: currency, shipping defaults, their SSLCommerz credentials, and the AI
 * agent's persona. Scoped by businessId alone so the agent can never cross tenant
 * boundaries: one person can own several stores, so the owner's user id was never
 * enough to tell them apart, and it is no longer stored here at all.
 */
export const businessProfile = pgTable(
  "business_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    industry: text("industry"),
    address: text("address"),
    logoUrl: text("logo_url"),
    currency: text("currency").default("BDT").notNull(),
    defaultShippingCost: integer("default_shipping_cost").default(0).notNull(),
    supportEmail: text("support_email"),
    notificationEmail: text("notification_email"),
    supportPhone: text("support_phone"),
    /**
     * This business's OWN SSLCommerz merchant credentials — used only for their customers'
     * order checkout (online payment), never for SellPilot's own SaaS billing (see
     * platformSettings in billing-schema.ts). Nullable: until an owner sets these, their
     * customers only see Cash on Delivery at checkout — never a silent fallback to any
     * shared/platform account, which would route their customers' money to the wrong place.
     */
    sslcommerzStoreId: text("sslcommerz_store_id"),
    sslcommerzStorePassword: text("sslcommerz_store_password"),
    /**
     * AI agent persona/behavior settings (spec §5.2 Settings > AI Agent tab). All nullable
     * or defaulted so an owner who never opens that tab still gets sane behavior — null
     * agentName falls back to the store name, "auto" language keeps the existing
     * detect-and-mirror behavior.
     */
    agentName: text("agent_name"),
    /** "friendly" | "professional" | "playful" | "formal" */
    conversationTone: text("conversation_tone").default("friendly").notNull(),
    /** "auto" | "bangla" | "english" — overrides the agent's per-message language detection */
    preferredLanguage: text("preferred_language").default("auto").notNull(),
    /** Minutes of inactivity before the abandoned-conversation follow-up fires (spec
     * FR-AGT-13's "configurable delay, default 30 min") */
    abandonedFollowupMinutes: integer("abandoned_followup_minutes").default(30).notNull(),
    /** Auto-escalation: when enabled, the agent hands off to a human if its self-reported
     * confidence falls below the threshold (0-100). */
    autoEscalateOnLowConfidence: boolean("auto_escalate_on_low_confidence")
      .default(false)
      .notNull(),
    /** Confidence threshold (0-100). Below this → auto-escalate to human. */
    confidenceThreshold: integer("confidence_threshold").default(30).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /** Set once the onboarding wizard reaches its final "trial started" screen — null means
     * the business exists but the wizard was abandoned partway (see business.enterBySlug). */
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("business_profile_org_unique").on(table.businessId)],
);

/**
 * Discount / promotional offers. Scoped by businessId.
 */
export const offer = pgTable(
  "offer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    code: text("code"),
    description: text("description"),
    /** Discount type: "percentage" | "fixed" */
    type: text("type").default("percentage").notNull(),
    /** For percentage: 10 = 10%. For fixed: whole taka, same convention as order.total (see D2). */
    value: integer("value").notNull(),
    minSubtotal: integer("min_subtotal").default(0).notNull(),
    /**
     * When both combo fields are set, this offer is a paired-product combo discount (e.g.
     * "Panjabi + Pajama, ৳100 off") rather than a customer-typed coupon code — it applies
     * automatically when both products are in the same order, no code needed. Nullable so
     * every existing/ordinary coupon (code + minSubtotal) is unaffected. Order doesn't
     * matter: a combo matches whichever product is A or B in either order.
     */
    comboProductAId: text("combo_product_a_id").references(() => product.id, { onDelete: "cascade" }),
    comboProductBId: text("combo_product_b_id").references(() => product.id, { onDelete: "cascade" }),
    /**
     * Flags this offer for proactive, unprompted mention by the AI agent (festival/seasonal
     * campaigns), as opposed to an ordinary coupon the customer must type or a combo that
     * only surfaces when its specific product pair comes up. Independent of the combo
     * fields — a campaign can be code-based, automatic, or a combo, and still be featured.
     */
    isCampaign: boolean("is_campaign").default(false).notNull(),
    startDate: timestamp("start_date").defaultNow().notNull(),
    endDate: timestamp("end_date"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("offer_org_id_idx").on(table.businessId),
    index("offer_combo_product_a_idx").on(table.comboProductAId),
    index("offer_combo_product_b_idx").on(table.comboProductBId),
  ],
);

/**
 * Customers (shoppers) per merchant. Scoped by businessId.
 * Lookup by phone/email — created lazily by the AI agent when placing an order.
 */
export const customer = pgTable(
  "customer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
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
    index("customer_org_id_idx").on(table.businessId),
    unique("customer_org_phone_unique").on(table.businessId, table.phone),
    unique("customer_org_email_unique").on(table.businessId, table.email),
  ],
);

/**
 * Orders. Scoped by businessId. status lifecycle:
 * pending -> confirmed -> paid -> shipped -> delivered -> cancelled | returned
 */
export const order = pgTable(
  "order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),
    /** Human-readable order number, e.g. #10051 */
    orderNumber: text("order_number").notNull(),
    status: text("status").default("pending").notNull(),
    /** Whole taka, not paisa — checkout.ts passes this straight into SSLCommerz's `amount` field unconverted */
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
    /** Set once, the first time status transitions to "delivered" — drives the
     * review-request sweep's delay window (apps/worker/src/handlers/review-request.ts).
     * Distinct from updatedAt, which moves on any field change, not just delivery. */
    deliveredAt: timestamp("delivered_at"),
    /** Set by the review-request sweep once it's asked — prevents asking twice. */
    reviewRequestSentAt: timestamp("review_request_sent_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("order_org_id_idx").on(table.businessId),
    index("order_customer_id_idx").on(table.customerId),
    index("order_thread_id_idx").on(table.threadId),
    unique("order_org_order_number_unique").on(table.businessId, table.orderNumber),
    unique("order_payment_token_unique").on(table.paymentToken),
  ],
);

/**
 * System event notification preferences per business (FR-SET-04).
 */
export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    /** "new_order" | "low_stock" | "human_handoff" | "quota_alert" | "weekly_insights" */
    eventType: text("event_type").notNull(),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    inAppEnabled: boolean("in_app_enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notif_pref_business_id_idx").on(table.businessId),
    unique("notif_pref_biz_event_unique").on(table.businessId, table.eventType),
  ],
);

/**
 * Order status transition history log (FR-ORD-03).
 */
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").notNull(),
    changedById: text("changed_by_id"),
    changedByName: text("changed_by_name"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_status_history_order_id_idx").on(table.orderId),
    index("order_status_history_business_id_idx").on(table.businessId),
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
    /** Unit price in whole taka at time of purchase */
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
 * Live/abandoned carts, one row per in-progress conversation cart — the multi-item
 * shopping cart the AI agent builds up via quoteOrder (packages/db/src/helpers/aiHelpers.ts's
 * upsertActiveCart), and the record the abandoned-cart follow-up sweep
 * (apps/worker/src/handlers/conversation-followup.ts) reads to know what to reference.
 * status lifecycle: active -> abandoned -> recovered | converted
 */
export const cart = pgTable(
  "cart",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
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
    index("cart_business_id_idx").on(table.businessId),
    index("cart_status_idx").on(table.status),
    // Mirrors agent_session_org_thread_unique — a thread belongs to exactly one store, and
    // this is the upsert target for upsertActiveCart. Keyed by business, not the owner's
    // user id: one person can own several stores, so (userId, threadId) could collide
    // across two of their own stores and silently merge their carts.
    unique("cart_business_thread_unique").on(table.businessId, table.threadId),
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
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
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
    index("review_business_id_idx").on(table.businessId),
    index("review_order_id_idx").on(table.orderId),
    index("review_product_id_idx").on(table.productId),
  ],
);

/**
 * In-app notifications for the merchant (dashboard bell icon) — business-wide activity
 * feed (new order, payment received, COD confirmed, abandoned follow-up sent, low
 * stock, etc.), not scoped to a single recipient. For an SMB-sized team, every staff
 * member seeing every notification is simpler and more useful than building per-user
 * targeting/read-state for a first version. There is deliberately no userId: createNotification
 * only ever takes a businessId, so the column sat NULL on every row it ever had. Per-recipient
 * targeting needs a read-state design (who dismissed what), not just a nullable column, so
 * it can be added properly when it's actually built.
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    /** e.g. "order_created", "payment_received", "cod_confirmed", "abandoned_followup_sent", "low_stock" */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** In-app path to navigate to on click, e.g. /dashboard/orders */
    link: text("link"),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_org_id_idx").on(table.businessId),
    index("notification_org_unread_idx").on(table.businessId, table.read),
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
    businessId: text("business_id")
      .references(() => business.id, { onDelete: "cascade" }),
    /** "monthly" | "half_yearly" | "yearly" | "lifetime" */
    billingCycle: text("billing_cycle").default("monthly").notNull(),
    /** Reset by the renewal job each period — counts one per AI-generated message/reply
     * sent, not LLM token volume. See apps/worker/src/lib/ai-conversations.ts. */
    aiConversationsUsed: integer("ai_conversations_used").default(0),
    /** "starter" | "growth" | "pro" — must match PLAN_CATALOG keys in api/src/lib/plans.ts */
    plan: text("plan").notNull(),
    /** "trialing" | "active" | "past_due" | "cancelled" */
    status: text("status").default("trialing").notNull(),
    /** Payment provider once wired up, e.g. "sslcommerz" */
    provider: text("provider"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: timestamp("current_period_start").defaultNow().notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    /** Whole taka charged per renewal at the time of subscribe — price changes don't repricing existing subs */
    amount: integer("amount").default(0).notNull(),
    /** Set when the owner schedules a downgrade that only applies at period end (D-S2-E) */
    pendingPlan: text("pending_plan"),
    /** Which payment_method row to charge on renewal */
    paymentMethodId: text("payment_method_id"),
    productsUsed: integer("products_used").default(0).notNull(),
    seatsUsed: integer("seats_used").default(1).notNull(),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0).notNull(),
    usageResetAt: timestamp("usage_reset_at").defaultNow().notNull(),
    /** Set once per billing period the first time aiConversationsUsed crosses 80%/100% of
     * the plan's included volume — guards the usage-alert email/notification from firing
     * on every message once past a threshold. Reset to null alongside aiConversationsUsed
     * in subscription.ts's markInvoicePaid. */
    usageAlert80SentAt: timestamp("usage_alert_80_sent_at"),
    usageAlert100SentAt: timestamp("usage_alert_100_sent_at"),
    /** Consecutive failed renewal charges — drives the 3-strike dunning ladder */
    failedPaymentCount: integer("failed_payment_count").default(0).notNull(),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_status_idx").on(table.status),
    // checkLockStatus, enterBySlug, and the renewal job all assume exactly one row per
    // business — without this, a duplicate insert would silently give a business two
    // conflicting subscriptions.
    unique("subscription_business_id_unique").on(table.businessId),
    index("subscription_period_end_idx").on(table.currentPeriodEnd),
  ],
);

/**
 * FAQ knowledge base. Scoped by businessId.
 */
export const faq = pgTable(
  "faq",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("faq_org_id_idx").on(table.businessId)],
);

/**
 * Store policies (shipping, return, warranty, privacy...). Scoped by businessId.
 * type values: "shipping" | "return" | "warranty" | "privacy" | "terms"
 */
export const policy = pgTable(
  "policy",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
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
    index("policy_org_id_idx").on(table.businessId),
    unique("policy_org_type_unique").on(table.businessId, table.type),
  ],
);

/**
 * Shipping rates per district. Scoped by businessId.
 * Used by the AI agent's calculateShipping tool.
 */
export const shippingRate = pgTable(
  "shipping_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    district: text("district").notNull(),
    /** Whole taka */
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
    index("shipping_rate_org_id_idx").on(table.businessId),
    unique("shipping_rate_org_district_unique").on(
      table.businessId,
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
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
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
    /** Set once the abandoned-conversation follow-up sweep has messaged this session —
     * a single nudge per session (spec FR-AGT-13), not a repeating ladder, so this just
     * needs to exist, not count anything. */
    followUpSentAt: timestamp("follow_up_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("agent_session_org_id_idx").on(table.businessId),
    unique("agent_session_org_thread_unique").on(table.businessId, table.threadId),
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
  /** Set alongside currentStep: "product_selected" — the last product the customer asked
   * about, so an abandoned-conversation follow-up (FR-AGT-13) can reference it even when
   * they never got as far as a cart. */
  lastViewedProductId?: string;
  pendingOrderId?: string;
  notes?: string;
}

// Relations ------------------------------------------------------------------

export const businessProfileRelations = relations(
  businessProfile,
  ({ one }) => ({
    business: one(business, {
      fields: [businessProfile.businessId],
      references: [business.id],
    }),
  }),
);

export const offerRelations = relations(offer, ({ one }) => ({
}));

export const customerRelations = relations(customer, ({ one, many }) => ({
  orders: many(order),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  business: one(business, { fields: [order.businessId], references: [business.id] }),
  customer: one(customer, {
    fields: [order.customerId],
    references: [customer.id],
  }),
  items: many(orderItem),
  history: many(orderStatusHistory),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(order, { fields: [orderStatusHistory.orderId], references: [order.id] }),
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
}));

export const policyRelations = relations(policy, ({ one }) => ({
}));

export const shippingRateRelations = relations(shippingRate, ({ one }) => ({
}));

export const agentSessionRelations = relations(agentSession, ({ one }) => ({
  business: one(business, { fields: [agentSession.businessId], references: [business.id] }),
}));

export const cartRelations = relations(cart, ({ one }) => ({
  business: one(business, { fields: [cart.businessId], references: [business.id] }),
  customer: one(customer, { fields: [cart.customerId], references: [customer.id] }),
  convertedOrder: one(order, { fields: [cart.convertedOrderId], references: [order.id] }),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  business: one(business, { fields: [review.businessId], references: [business.id] }),
  order: one(order, { fields: [review.orderId], references: [order.id] }),
  customer: one(customer, { fields: [review.customerId], references: [customer.id] }),
  product: one(product, { fields: [review.productId], references: [product.id] }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  business: one(business, { fields: [notification.businessId], references: [business.id] }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  business: one(business, { fields: [subscription.businessId], references: [business.id] }),
}));

/**
 * Merchant-configured custom KPI targets for Analytics dashboard (Pro plan feature).
 */
export const customKpi = pgTable(
  "custom_kpi",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    metricType: text("metric_type").notNull(),
    targetValue: integer("target_value").notNull(),
    period: text("period").default("weekly").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("custom_kpi_business_idx").on(table.businessId)],
);

export const customKpiRelations = relations(customKpi, ({ one }) => ({
  business: one(business, { fields: [customKpi.businessId], references: [business.id] }),
}));
