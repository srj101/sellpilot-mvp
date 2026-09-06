/**
 * The one place a cost is priced and written down.
 *
 * Callers say what they consumed — tokens, audio seconds, stored bytes, an email — and
 * this resolves the rate that applied at that moment, freezes the money onto the row, and
 * moves on. No caller does arithmetic on prices, because the moment two of them do it
 * differently the ledger stops adding up and there is no way to tell which half is wrong.
 *
 * Three rules hold everything together:
 *
 *  1. NEVER THROW. Recording a cost runs inside the path that answers a customer. A
 *     merchant losing a sale because our accounting hiccuped is a far worse outcome than
 *     a missing row, so every failure here is caught and logged.
 *  2. ALWAYS WRITE A ROW, even at zero. An unpriced model or a free tier still gets an
 *     event with costMicroUsd 0 — knowing the volume is exactly what tells you when a free
 *     tier is about to stop being free, or that a newly deployed model was never priced.
 *  3. FREEZE THE RATE. The cost is computed once, here, and never derived again at read
 *     time. See platform-cost-schema.ts for why.
 */
import { and, desc, eq, lte } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { fxRate, platformCostEvent, platformCostRate } from "@acme/db/schema";

/** 1 USD, in the integer micro-units every money column on these tables uses. */
export const MICRO = 1_000_000;

export type CostService =
  | "openai"
  | "openai_transcription"
  | "nvidia"
  | "aws_s3"
  | "aws_ses"
  | "sslcommerz"
  | "meta_whatsapp"
  | "neon"
  | "redis"
  | "hosting";

export type CostSource =
  | "dm_reply"
  | "comment_reply"
  | "conversation_followup"
  | "weekly_insights"
  | "copilot"
  | "product_keywords"
  | "transcription"
  | "media_storage"
  | "email"
  | "saas_billing"
  | "fixed";

interface ResolvedRate {
  id: string | null;
  microUsdPerUnit: number;
  unitSize: number;
}

/**
 * Rate lookups are cached because the alternative is a database round trip per model call,
 * on the reply path, for a number that changes a few times a year. The TTL is short enough
 * that a superadmin correcting a price sees it take effect within a minute without a
 * deploy, and long enough that a burst of replies costs one query rather than hundreds.
 *
 * Only "current" lookups are cached. A backdated event (a rollup, an imported invoice) asks
 * for the rate at a past instant and must not be served a cached present-day price.
 */
const RATE_CACHE_TTL_MS = 60_000;
const rateCache = new Map<string, { rate: ResolvedRate; expiresAt: number }>();

/** Exported for tests and for the superadmin rate editor, which must invalidate after an
 * insert rather than leave the fleet serving a stale price for a minute. */
export function clearRateCache(): void {
  rateCache.clear();
}

async function resolveRate(
  db: typeof Db,
  service: CostService,
  sku: string,
  at: Date,
  useCache: boolean,
): Promise<ResolvedRate> {
  const key = `${service}:${sku}`;

  if (useCache) {
    const hit = rateCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.rate;
  }

  const [row] = await db
    .select({
      id: platformCostRate.id,
      microUsdPerUnit: platformCostRate.microUsdPerUnit,
      unitSize: platformCostRate.unitSize,
    })
    .from(platformCostRate)
    .where(
      and(
        eq(platformCostRate.service, service),
        eq(platformCostRate.sku, sku),
        lte(platformCostRate.effectiveFrom, at),
      ),
    )
    .orderBy(desc(platformCostRate.effectiveFrom))
    .limit(1);

  // An unpriced sku is recorded at zero rather than dropped — see rule 2 above. The warning
  // is the signal to go seed it; the row is what stops the volume being lost meanwhile.
  const rate: ResolvedRate = row
    ? { id: row.id, microUsdPerUnit: row.microUsdPerUnit, unitSize: row.unitSize || 1 }
    : { id: null, microUsdPerUnit: 0, unitSize: 1 };

  if (!row) {
    console.warn(`[platform-cost] No rate for ${key} at ${at.toISOString()} — recorded at $0`);
  }

  if (useCache) rateCache.set(key, { rate, expiresAt: Date.now() + RATE_CACHE_TTL_MS });
  return rate;
}

export interface RecordCostParams {
  db: typeof Db;
  /** Null/undefined for platform-wide fixed cost that no single store caused. */
  businessId?: string | null;
  service: CostService;
  sku: string;
  source: CostSource;
  /** Base units consumed: tokens, audio seconds, GB-months, emails, conversations. */
  quantity: number;
  /** The thread, order, job or invoice this belongs to, for tracing a suspicious figure
   * back to what caused it. */
  referenceId?: string;
  /** When the usage happened. Defaults to now; pass it for backdated imports. */
  occurredAt?: Date;
}

/**
 * Price one unit of consumption and write it to the ledger.
 *
 * Returns the cost in micro-USD so a caller that wants to log or surface it can, but the
 * return value is incidental — the row is the point, and a failure returns 0 rather than
 * propagating.
 */
export async function recordCostEvent(params: RecordCostParams): Promise<number> {
  const { db, service, sku, source, quantity } = params;

  // Zero-quantity calls are not an error, they are just nothing to record. Writing them
  // would bury the real rows under noise from every no-op reply.
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  try {
    const occurredAt = params.occurredAt ?? new Date();
    // Only a "now" lookup may be cached; a backdated one must read the historical price.
    const isCurrent = !params.occurredAt;
    const rate = await resolveRate(db, service, sku, occurredAt, isCurrent);

    // Rounded once, here, so the stored figure is the figure — no read-time arithmetic can
    // disagree with it later.
    const costMicroUsd = Math.round((quantity * rate.microUsdPerUnit) / rate.unitSize);

    await db.insert(platformCostEvent).values({
      businessId: params.businessId ?? null,
      service,
      sku,
      source,
      quantity,
      microUsdPerUnit: rate.microUsdPerUnit,
      unitSize: rate.unitSize,
      costMicroUsd,
      rateId: rate.id,
      referenceId: params.referenceId,
      occurredAt,
    });

    return costMicroUsd;
  } catch (err) {
    // Rule 1. A customer is waiting on the other side of this call.
    console.error(`[platform-cost] Failed to record ${service}:${sku}`, err);
    return 0;
  }
}

/** The token counts an LLM call reports back, as the agent already shapes them. */
export interface LlmTokenUsage {
  prompt: number;
  completion: number;
  /** Prompt tokens served from the provider's cache, priced far below fresh input. The
   * system prompt is large and mostly static across a conversation, so ignoring this
   * overstates spend substantially. Subtracted from `prompt` before pricing. */
  cachedPrompt?: number;
}

/**
 * The `usage` block an OpenAI-compatible /chat/completions response carries.
 *
 * Four call sites in this codebase talk to the API with a raw fetch rather than through the
 * agent, and each was discarding this. Parsing it in one place keeps them from disagreeing
 * about field names — `prompt_tokens_details.cached_tokens` in particular is easy to miss,
 * and missing it overstates spend on a product whose system prompt is large and static.
 */
export interface OpenAiUsageBlock {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Returns null when the provider reported no usage, so callers can skip recording rather
 * than write a row of zeroes that looks like a free call. */
export function usageFromOpenAi(usage: OpenAiUsageBlock | undefined): LlmTokenUsage | null {
  if (!usage) return null;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  if (prompt <= 0 && completion <= 0) return null;
  return {
    prompt,
    completion,
    cachedPrompt: usage.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

/**
 * Record one model call as its separately-priced parts.
 *
 * Input, cached input and output are three different prices for the same call — output
 * typically costs several times input — so a single blended "total tokens" number cannot
 * produce a correct figure. They are written as separate rows against separate skus, which
 * is also what lets the dashboard show that output tokens dominate the bill.
 */
export async function recordLlmUsage(params: {
  db: typeof Db;
  businessId?: string | null;
  model: string;
  usage: LlmTokenUsage;
  source: CostSource;
  referenceId?: string;
  occurredAt?: Date;
}): Promise<number> {
  const { db, businessId, model, usage, source, referenceId, occurredAt } = params;

  const cached = Math.max(0, usage.cachedPrompt ?? 0);
  // A provider reporting more cached tokens than prompt tokens would otherwise bill us a
  // negative amount for fresh input.
  const freshPrompt = Math.max(0, usage.prompt - cached);

  const parts: { sku: string; quantity: number }[] = [
    { sku: `${model}:input`, quantity: freshPrompt },
    { sku: `${model}:cached_input`, quantity: cached },
    { sku: `${model}:output`, quantity: usage.completion },
  ];

  let total = 0;
  for (const part of parts) {
    total += await recordCostEvent({
      db,
      businessId,
      service: "openai",
      sku: part.sku,
      source,
      quantity: part.quantity,
      referenceId,
      occurredAt,
    });
  }
  return total;
}

/**
 * Convert micro-USD to MICRO-taka using the rate in force at a given moment.
 *
 * Read-time rather than write-time: the ledger is kept in the currency we are actually
 * billed in, and taka is a presentation concern. Doing it the other way would bake one
 * day's exchange rate into permanent history.
 *
 * Micro-taka, not whole taka. A single reply costs a fraction of a taka — measured, one
 * reply plus a short voice note is about ৳0.32 — so rounding to whole taka here reported
 * every individual cost as ৳0 and only came right once totals grew large. Returning
 * micro-units keeps per-event figures meaningful and matches every other money value in
 * this module; divide by MICRO at the point of display.
 *
 * Falls back to 0 when no rate is seeded, and says so — a silent guess at the taka rate is
 * the kind of number that ends up in a pricing decision.
 */
export async function microUsdToMicroBdt(
  db: typeof Db,
  microUsd: number,
  at: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ microRate: fxRate.microRate })
    .from(fxRate)
    .where(
      and(
        eq(fxRate.baseCurrency, "USD"),
        eq(fxRate.quoteCurrency, "BDT"),
        lte(fxRate.effectiveFrom, at),
      ),
    )
    .orderBy(desc(fxRate.effectiveFrom))
    .limit(1);

  if (!row) {
    console.warn("[platform-cost] No USD->BDT rate seeded — taka figures unavailable");
    return 0;
  }

  // microUsd * (microRate / MICRO) = micro-BDT, with the division done last to keep the
  // intermediate exact.
  return Math.round((microUsd * row.microRate) / MICRO);
}

/**
 * Taka to micro-USD, at the rate in force at a given moment.
 *
 * The gateway commission is the one cost that arrives natively in taka — SSLCommerz
 * deducts it from a taka charge — while every other cost is billed in dollars. Converting
 * it on the way in keeps the ledger single-currency, so a total is a sum rather than a
 * currency-aware special case at every read.
 *
 * Returns null rather than 0 when no rate is seeded: 0 would silently record a real fee as
 * free, which is worse than recording nothing and saying so.
 */
export async function bdtToMicroUsd(
  db: typeof Db,
  taka: number,
  at: Date = new Date(),
): Promise<number | null> {
  const [row] = await db
    .select({ microRate: fxRate.microRate })
    .from(fxRate)
    .where(
      and(
        eq(fxRate.baseCurrency, "USD"),
        eq(fxRate.quoteCurrency, "BDT"),
        lte(fxRate.effectiveFrom, at),
      ),
    )
    .orderBy(desc(fxRate.effectiveFrom))
    .limit(1);

  if (!row || row.microRate <= 0) return null;

  // taka / (BDT per USD) -> USD, then to micro-USD. microRate is itself scaled by MICRO.
  return Math.round((taka * MICRO * MICRO) / row.microRate);
}

/**
 * Percentage costs (payment gateway commission) priced from basis points.
 *
 * Kept separate from recordCostEvent's per-unit path because the quantity here is money,
 * not units, and conflating the two is how a 2.5% fee becomes a $2.50 one.
 */
export async function recordPercentCost(params: {
  db: typeof Db;
  businessId?: string | null;
  service: CostService;
  sku: string;
  source: CostSource;
  /** The amount the percentage applies to, in micro-USD. */
  baseMicroUsd: number;
  /** Actual fee when the provider reports it (SSLCommerz returns store_amount, so the fee
   * is known exactly). Preferred over the configured rate whenever present — a real
   * settlement figure beats our estimate of it. */
  actualFeeMicroUsd?: number;
  referenceId?: string;
  occurredAt?: Date;
}): Promise<number> {
  const { db, service, sku, source, baseMicroUsd } = params;

  try {
    const occurredAt = params.occurredAt ?? new Date();

    let feeMicroUsd = params.actualFeeMicroUsd;
    let bps = 0;

    if (feeMicroUsd === undefined) {
      const [row] = await db
        .select({ percentBps: platformCostRate.percentBps })
        .from(platformCostRate)
        .where(
          and(
            eq(platformCostRate.service, service),
            eq(platformCostRate.sku, sku),
            lte(platformCostRate.effectiveFrom, occurredAt),
          ),
        )
        .orderBy(desc(platformCostRate.effectiveFrom))
        .limit(1);

      bps = row?.percentBps ?? 0;
      feeMicroUsd = Math.round((baseMicroUsd * bps) / 10_000);
    }

    if (feeMicroUsd <= 0) return 0;

    await db.insert(platformCostEvent).values({
      businessId: params.businessId ?? null,
      service,
      sku,
      source,
      // The base the fee was taken from, so a reader can check the effective rate.
      quantity: baseMicroUsd,
      microUsdPerUnit: bps,
      unitSize: 10_000,
      costMicroUsd: feeMicroUsd,
      referenceId: params.referenceId,
      occurredAt,
    });

    return feeMicroUsd;
  } catch (err) {
    console.error(`[platform-cost] Failed to record percent cost ${service}:${sku}`, err);
    return 0;
  }
}

/**
 * Storage is a rate, not an event: a file sitting in S3 costs money every month it stays,
 * so it cannot be charged once when written. This prices the whole of a business's stored
 * bytes for one day, and is called by the nightly sweep.
 *
 * GB-months are converted to GB-days by the sweep's caller rather than here, so the unit
 * stored on the row matches the unit the vendor's pricing page uses.
 */
export async function recordDailyStorageCost(params: {
  db: typeof Db;
  businessId: string;
  bytesStored: number;
  day: Date;
}): Promise<number> {
  const { db, businessId, bytesStored, day } = params;
  if (bytesStored <= 0) return 0;

  const gb = bytesStored / (1024 * 1024 * 1024);
  const daysInMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();

  // One day's share of a GB-month price.
  const gbMonths = gb / daysInMonth;

  // Sub-unit quantities cannot be stored in a bigint column, and rounding GB-months to a
  // whole number would floor almost every business to zero. Micro-GB-months keep the
  // precision while staying integral.
  const microGbMonths = Math.round(gbMonths * MICRO);

  return recordCostEvent({
    db,
    businessId,
    service: "aws_s3",
    sku: "storage_micro_gb_month",
    source: "media_storage",
    quantity: microGbMonths,
    occurredAt: day,
  });
}
