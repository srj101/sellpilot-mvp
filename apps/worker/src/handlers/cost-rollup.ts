/**
 * The nightly cost sweep: meter what storage cost yesterday, then roll the raw ledger up.
 *
 * Two jobs in one pass because they are the same pass. Storage is the cost that has no
 * event to hang off — a file sitting in S3 costs money every day it stays there, not once
 * when it was written — so somebody has to walk the businesses and price what they are
 * holding. Having done that walk, rolling the day up costs one more query.
 *
 * The rollup exists because the dashboard must never read platform_cost_event directly. At
 * the message volume this product is built for, one row per model call means a 90-day cost
 * chart scans millions of rows, and that is the kind of slow that only appears in
 * production months after the code shipped.
 */
import { and, gte, lt, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { platformCostDaily, platformCostEvent, subscription } from "@acme/db/schema";
import { recordDailyStorageCost } from "@acme/api/platform-cost";

/** Midnight UTC of the day that just ended. */
function yesterdayUtc(): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Price one day of every business's stored bytes.
 *
 * Reads subscription.storageUsedBytes rather than summing conversation_media, because that
 * counter is what the merchant is actually charged against and what the billing page
 * shows — costing a different number than the one the product enforces would produce two
 * storage figures that never reconcile.
 */
async function meterStorage(day: Date): Promise<number> {
  const rows = await db
    .select({
      businessId: subscription.businessId,
      bytes: subscription.storageUsedBytes,
    })
    .from(subscription);

  let metered = 0;
  for (const row of rows) {
    if (!row.businessId || row.bytes <= 0) continue;
    try {
      await recordDailyStorageCost({
        db,
        businessId: row.businessId,
        bytesStored: row.bytes,
        day,
      });
      metered++;
    } catch (err) {
      // One business's failure must not stop the rest being metered.
      console.error(`[cost-rollup] Storage metering failed for ${row.businessId}:`, err);
    }
  }
  return metered;
}

/**
 * Collapse one day of raw events into platform_cost_daily.
 *
 * Done as a single INSERT ... SELECT rather than by reading rows into the worker: a busy
 * day is a lot of rows, and none of them need to travel over the wire to be summed.
 *
 * The conflict clause makes a re-run idempotent. Re-running a day must overwrite that day's
 * buckets, never add to them — otherwise a retry silently doubles the cost history, and a
 * doubled cost figure is indistinguishable from a real one.
 */
async function rollUpDay(start: Date, end: Date): Promise<number> {
  const result = await db
    .insert(platformCostDaily)
    .select(
      db
        .select({
          businessId: platformCostEvent.businessId,
          day: sql<Date>`${start}::timestamp`.as("day"),
          service: platformCostEvent.service,
          sku: platformCostEvent.sku,
          source: platformCostEvent.source,
          quantity: sql<number>`sum(${platformCostEvent.quantity})`.as("quantity"),
          costMicroUsd: sql<number>`sum(${platformCostEvent.costMicroUsd})`.as(
            "cost_micro_usd",
          ),
          eventCount: sql<number>`count(*)::int`.as("event_count"),
        })
        .from(platformCostEvent)
        .where(
          and(
            gte(platformCostEvent.occurredAt, start),
            lt(platformCostEvent.occurredAt, end),
          ),
        )
        .groupBy(
          platformCostEvent.businessId,
          platformCostEvent.service,
          platformCostEvent.sku,
          platformCostEvent.source,
        ),
    )
    .onConflictDoUpdate({
      target: [
        platformCostDaily.businessId,
        platformCostDaily.day,
        platformCostDaily.service,
        platformCostDaily.sku,
        platformCostDaily.source,
      ],
      set: {
        quantity: sql`excluded.quantity`,
        costMicroUsd: sql`excluded.cost_micro_usd`,
        eventCount: sql`excluded.event_count`,
      },
    });

  return result.rowCount ?? 0;
}

export async function runCostRollup(): Promise<void> {
  const { start, end } = yesterdayUtc();

  // Storage first: it writes events dated to that day, so the rollup below must run after
  // it or the day's storage cost lands in the ledger but not in the summary the dashboard
  // reads — the figures would then disagree with each other for exactly one day.
  const metered = await meterStorage(start);
  const buckets = await rollUpDay(start, end);

  console.log(
    `[cost-rollup] ${start.toISOString().slice(0, 10)}: ` +
      `metered storage for ${metered} business(es), rolled up ${buckets} bucket(s)`,
  );
}
