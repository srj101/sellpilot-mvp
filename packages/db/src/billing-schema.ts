import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { business, user } from "./auth-schema";
import { order, subscription } from "./agent-schema";

/**
 * SellPilot billing cards only — never bKash/Nagad (see SELLPILOT_PHASE1_BILLING_PAYMENTS_PLAN.md
 * D5: SaaS billing restricts SSLCommerz to card/bank rails via multi_card_name).
 */
export const paymentMethod = pgTable(
  "payment_method",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "visa" | "mastercard" | "amex" | "other" — derived from BIN by the gateway, never guessed client-side */
    brand: text("brand").notNull(),
    last4: text("last4").notNull(),
    expiryMonth: integer("expiry_month").notNull(),
    expiryYear: integer("expiry_year").notNull(),
    cardholderName: text("cardholder_name"),
    billingAddress: text("billing_address"),
    /** SSLCommerz stored-card token. NEVER a PAN or CVC. */
    providerToken: text("provider_token"),
    provider: text("provider").default("sslcommerz").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("payment_method_business_id_idx").on(t.businessId)],
);

/**
 * SellPilot billing the business owner — distinct from the customer-facing Invoices page,
 * which derives invoices from orders. Named saasInvoice specifically to avoid that collision.
 */
export const saasInvoice = pgTable(
  "saas_invoice",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscription.id, { onDelete: "set null" }),
    /** Human-readable, sequential: SP-2026-000123 */
    invoiceNumber: text("invoice_number").notNull(),
    plan: text("plan").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    /** Whole taka */
    amount: integer("amount").notNull(),
    /** "paid" | "pending" | "failed" | "refunded" */
    status: text("status").default("pending").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    paidAt: timestamp("paid_at"),
    provider: text("provider"),
    providerTransactionId: text("provider_transaction_id"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("saas_invoice_business_id_idx").on(t.businessId),
    unique("saas_invoice_number_unique").on(t.invoiceNumber),
  ],
);

/**
 * The business's own customer-payment ledger (spec §5.2) — distinct from saasInvoice above.
 * Not derived from `order` because refunds and per-attempt payment records don't fit there;
 * see D4 in the billing plan.
 */
export const transaction = pgTable(
  "transaction",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
    /** Gateway/provider reference shown to the owner */
    reference: text("reference").notNull(),
    /** "bkash" | "nagad" | "card" | "internetbank" | "cod" — the real rail, see D8 */
    method: text("method").notNull(),
    /** "success" | "pending" | "failed" | "refunded" */
    status: text("status").default("pending").notNull(),
    /** Whole taka */
    amount: integer("amount").notNull(),
    /** Split out so "Delivery Charges Collected" is a sum, not a join-and-guess */
    deliveryCharge: integer("delivery_charge").default(0).notNull(),
    refundedAmount: integer("refunded_amount").default(0).notNull(),
    refundedAt: timestamp("refunded_at"),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("transaction_business_id_idx").on(t.businessId),
    index("transaction_order_id_idx").on(t.orderId),
    index("transaction_created_at_idx").on(t.createdAt),
  ],
);
