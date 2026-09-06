import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { business } from "./auth-schema";

/**
 * What it costs us to run SellPilot, and who ran up the bill.
 *
 * The superadmin console could show what merchants sell (totalGmv) but not what we earn
 * or spend, so "are we profitable on this store?" had no answer anywhere in the product.
 * Every input to it existed and none of it was kept: the sales agent computed prompt and
 * completion tokens on every reply and passed them to a console.log, S3 bytes were written
 * without a price attached, and the gateway fee on each subscription charge was thrown away
 * with the validation response.
 *
 * Two tables because cost has two independent halves that change on different clocks:
 * WHAT WE USED (below, append-only, immutable) and WHAT IT COSTS (the rate book, versioned
 * by effectiveFrom). Keeping them apart is what lets a price change apply going forward
 * without silently rewriting last quarter's margins.
 */

/**
 * The price book. One row per (service, sku) per price change.
 *
 * Rates are versioned rather than overwritten because a cost ledger whose history moves
 * when a vendor raises prices is worse than no ledger — you would not be able to tell a
 * genuine margin regression from a repricing. Look-ups pick the row with the latest
 * effectiveFrom at or before the event, so correcting a rate is an INSERT, never an UPDATE.
 *
 * Every vendor prices in USD; the taka conversion happens at read time against a stored FX
 * rate, never here — see platform-cost.ts.
 */
export const platformCostRate = pgTable(
  "platform_cost_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** "openai" | "openai_transcription" | "aws_s3" | "aws_ses" | "sslcommerz"
     * | "meta_whatsapp" | "neon" | "redis" | "hosting" | "nvidia" */
    service: text("service").notNull(),

    /**
     * What is being priced, within the service. The model name for tokens
     * ("gpt-4o:input", "gpt-4o:output", "gpt-4o:cached_input"), or the resource for
     * everything else ("storage_gb_month", "egress_gb", "conversation_bd", "monthly").
     */
    sku: text("sku").notNull(),

    /**
     * Price in micro-USD (1 USD = 1_000_000) for `unitSize` base units.
     *
     * Integer micro-USD rather than a float because these numbers are summed across
     * millions of rows and a float would drift; and rather than cents because a single
     * token costs a small fraction of one cent. Token prices are quoted per million, so
     * "$2.50 per 1M input tokens" is stored as microUsdPerUnit 2_500_000, unitSize
     * 1_000_000 — exactly, with no rounding at rest.
     */
    microUsdPerUnit: bigint("micro_usd_per_unit", { mode: "number" }).notNull(),

    /** How many base units microUsdPerUnit buys. 1_000_000 for per-million token pricing,
     * 1 for a per-GB or per-conversation price. */
    unitSize: bigint("unit_size", { mode: "number" }).default(1).notNull(),

    /** What one base unit is, for display and for sanity-checking a rate against its
     * vendor's pricing page: "token" | "audio_second" | "gb_month" | "gb" | "request"
     * | "email" | "conversation" | "month" | "percent_bps". */
    unit: text("unit").notNull(),

    /**
     * Percentage-based costs (payment gateway commission) do not fit a per-unit rate, so
     * they carry basis points instead and `microUsdPerUnit` stays 0. Kept as a separate
     * column rather than a magic sku so a reader cannot mistake 250 bps for $250.
     */
    percentBps: integer("percent_bps"),

    /** When this price took effect. The newest row at or before an event's timestamp wins. */
    effectiveFrom: timestamp("effective_from").notNull(),

    /** Where the number came from — a vendor pricing URL or invoice reference. Cost data
     * nobody can trace back to a source stops being trusted the first time it looks wrong. */
    source: text("source"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // The look-up: newest effectiveFrom at or before a timestamp, for one sku.
    index("platform_cost_rate_lookup_idx").on(
      table.service,
      table.sku,
      table.effectiveFrom,
    ),
    // Re-seeding the price book must be idempotent — the same price for the same sku
    // starting at the same instant is one fact, not two.
    unique("platform_cost_rate_version_unique").on(
      table.service,
      table.sku,
      table.effectiveFrom,
    ),
  ],
);

/**
 * One row per billable thing we consumed. Append-only.
 *
 * `costMicroUsd` is computed when the row is written and never recomputed. That is the
 * whole point of the table: it freezes the rate that actually applied, so history stays
 * true after a price change, and a margin figure from six months ago still reconciles
 * against the invoice we actually paid.
 *
 * businessId is nullable on purpose. Metered costs (a model call, a stored file) belong to
 * one store; fixed infrastructure (the VPS, the database, Redis) belongs to the platform
 * and is allocated across stores at read time by a chosen driver, not pretended to be
 * attributable at write time.
 */
export const platformCostEvent = pgTable(
  "platform_cost_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Null for platform-wide fixed cost. Cascade: a deleted business takes its own usage
     * rows with it, and the fixed-cost rows (businessId null) survive untouched. */
    businessId: text("business_id").references(() => business.id, {
      onDelete: "cascade",
    }),

    service: text("service").notNull(),
    sku: text("sku").notNull(),

    /**
     * Which part of the product spent this. "dm_reply" | "comment_reply" |
     * "conversation_followup" | "weekly_insights" | "copilot" | "product_keywords" |
     * "transcription" | "media_storage" | "email" | "saas_billing" | "fixed".
     *
     * Without it the ledger can say the platform spent $40 on tokens but not that the
     * merchant-facing Copilot — which is unmetered and bills nobody — accounted for most
     * of it. That is exactly the question this table exists to answer.
     */
    source: text("source").notNull(),

    /** How many base units (tokens, audio seconds, GB-months, emails, conversations). */
    quantity: bigint("quantity", { mode: "number" }).notNull(),

    /** The rate that applied, copied from platform_cost_rate at write time so the event
     * stays readable even if the rate row is later corrected or removed. */
    microUsdPerUnit: bigint("micro_usd_per_unit", { mode: "number" }).notNull(),
    unitSize: bigint("unit_size", { mode: "number" }).default(1).notNull(),

    /** quantity * microUsdPerUnit / unitSize, rounded once, at write time. Frozen. */
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull(),

    /** Free-tier and self-hosted usage still gets a row with costMicroUsd 0 — knowing the
     * volume is what tells you when a free tier is about to stop being free. */
    rateId: text("rate_id"),

    /** Correlation: the thread, order, job or invoice this cost belongs to, so a
     * suspicious number can be traced back to the conversation that caused it. */
    referenceId: text("reference_id"),

    /** When the usage happened (not when the row was written) — a nightly rollup or a
     * vendor invoice import backdates this. */
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Per-store margin over a period — the main dashboard read.
    index("platform_cost_event_business_time_idx").on(
      table.businessId,
      table.occurredAt,
    ),
    // "Where does the money go" across all stores.
    index("platform_cost_event_source_time_idx").on(
      table.source,
      table.occurredAt,
    ),
    // The nightly rollup's scan, and platform-wide totals for a period.
    index("platform_cost_event_time_idx").on(table.occurredAt),
  ],
);

/**
 * Nightly rollup of the event table, one row per business × service × sku × source × day.
 *
 * The dashboard reads this, never the raw events. At the message volume this product is
 * built for, a 90-day cost chart scanning individual model calls would be slow within
 * weeks of launch, and it is the kind of slow that only shows up in production.
 */
export const platformCostDaily = pgTable(
  "platform_cost_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Null for platform-wide fixed cost, matching platformCostEvent. */
    businessId: text("business_id").references(() => business.id, {
      onDelete: "cascade",
    }),

    /** Midnight UTC of the day being summarised. */
    day: timestamp("day").notNull(),

    service: text("service").notNull(),
    sku: text("sku").notNull(),
    source: text("source").notNull(),

    quantity: bigint("quantity", { mode: "number" }).notNull(),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull(),
    /** How many events rolled up — surfaces "cost per conversation" without the raw rows. */
    eventCount: integer("event_count").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("platform_cost_daily_business_day_idx").on(
      table.businessId,
      table.day,
    ),
    index("platform_cost_daily_day_idx").on(table.day),
    // Re-running a day's rollup must overwrite it, not double it.
    unique("platform_cost_daily_bucket_unique").on(
      table.businessId,
      table.day,
      table.service,
      table.sku,
      table.source,
    ),
  ],
);

/**
 * USD -> BDT, versioned.
 *
 * Every vendor bills in dollars and every subscription is charged in whole taka
 * (subscription.amount), so margin is a subtraction across two currencies and the rate is
 * part of the answer. A single mutable "current rate" constant would make last quarter's
 * profit move every time the taka does, which turns an FX swing into what looks like a
 * margin regression. Same versioning rule as the rate book: newest effectiveFrom at or
 * before the event wins, corrections are INSERTs.
 */
export const fxRate = pgTable(
  "fx_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** ISO codes, e.g. "USD" -> "BDT". */
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),

    /** Quote units per base unit, in micro-units (1 unit = 1_000_000) so a rate like
     * 119.75 BDT/USD is stored exactly as 119_750_000 rather than as a float. */
    microRate: bigint("micro_rate", { mode: "number" }).notNull(),

    effectiveFrom: timestamp("effective_from").notNull(),
    /** Where the rate came from — a bank reference or the invoice it was settled at. */
    source: text("source"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("fx_rate_lookup_idx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveFrom,
    ),
    unique("fx_rate_version_unique").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveFrom,
    ),
  ],
);
